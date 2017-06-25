#include <sys/mman.h>
#include <math.h>
#include <algorithm>

#ifndef OS_WIN
#include <pthread.h>
#endif

#include "stdafx.h"
#include "mandelbrot_strings.h"

#ifdef OS_WIN
#include "Resource.h"
#endif

#define PAGE_SIZE 4096
#define USE_THREADS


typedef void (*JIT_FUNC)(uint8_t*, uint8_t*, uint64_t, uint64_t, uint64_t, uint64_t*, double*, double*);


class JIT
{
private:
    uint8_t* m_code;
    
    uint8_t* m_constants0;
    
    // 32-byte aligned constants
    uint8_t* m_constants;
    
    size_t m_codeSize;
    
    int m_constantsCount;
    
public:
    JIT()
    {
        m_code = NULL;
        m_constants0 = NULL;
    }
    
    virtual ~JIT()
    {
        if (m_code)
            munmap(m_code, m_codeSize);
        if (m_constants0)
            delete[] m_constants0;
    }
    
    void SetConstant(int idx, Zephyros::JavaScript::Object constant)
    {
        if (!m_constants0)
            return;
        
        if (!constant->HasKey(TEXT("value")) || !constant->HasKey(TEXT("type")))
            return;
        
        String type = constant->GetString(TEXT("type"));
        CefValueType valueType = constant->GetType(TEXT("value"));
        
        if (type == TEXT("double"))
        {
            if (valueType == VTYPE_LIST)
            {
                // a list of different constants
                double c[4] = {0};
                Zephyros::JavaScript::Array values = constant->GetList(TEXT("value"));
                int len = values->GetSize();
                if (len > 4)
                    len = 4;
                
                for (int i = 0; i < len; ++i)
                    c[i] = values->GetDouble(i);
                
                SetConstants(idx, c[0], c[1], c[2], c[3]);
            }
            else if (valueType == VTYPE_DOUBLE || valueType == VTYPE_INT)
            {
                // one constant, which will be broadcast across the vector
                SetConstant(idx, constant->GetDouble(TEXT("value")));
            }
        }
        else if (type == TEXT("int"))
        {
            if (valueType == VTYPE_LIST)
            {
                // two int values are interpreted as a 64-bit constant
                Zephyros::JavaScript::Array values = constant->GetList(TEXT("value"));
                int len = values->GetSize();
                
                if (len >= 2)
                {
                    uint64_t hi = (uint64_t) values->GetDouble(0);
                    uint64_t lo = (uint64_t) values->GetDouble(1);
                    SetConstant(idx, ((hi & 0xffffffff) << 32) | (lo & 0xffffffff));
                }
                else if (len == 1)
                    SetConstant(idx, (uint32_t) values->GetDouble(0));
            }
            else if (valueType == VTYPE_DOUBLE || valueType == VTYPE_INT)
                SetConstant(idx, (uint32_t) constant->GetDouble(TEXT("value")));
        }
        else
            memset(m_constants + idx * 32, 0, 32);
    }
    
    void SetConstant(int idx, double v)
    {
        if (!m_constants0)
            return;
        
        SetConstants(idx, v, v, v, v);
    }
    
    void SetConstant(int idx, uint64_t v)
    {
        if (!m_constants0)
            return;
        
        for (int i = 0; i < 4; ++i)
            *((uint64_t*) &m_constants[idx * 32 + i * 8]) = v;
    }
    
    void SetConstant(int idx, uint32_t v)
    {
        if (!m_constants0)
            return;
        
        for (int i = 0; i < 4; ++i)
            *((uint32_t*) &m_constants[idx * 32 + i * 4]) = v;
        memset(m_constants + idx * 32 + 16, 0, 4 * sizeof(uint32_t));
    }
    
    void SetConstants(int idx, double v0, double v1, double v2, double v3)
    {
        if (!m_constants0)
            return;
        
        *((double*) &m_constants[idx * 32]) = v0;
        *((double*) &m_constants[idx * 32 + 8]) = v1;
        *((double*) &m_constants[idx * 32 + 16]) = v2;
        *((double*) &m_constants[idx * 32 + 24]) = v3;
    }
    
    void CompileCode(Zephyros::JavaScript::Array arrCode, Zephyros::JavaScript::Array arrConstants)
    {
        if (m_code)
            munmap(m_code, m_codeSize);
        if (m_constants0)
            delete[] m_constants0;
        
        // create the constants array
        int lenConstants = arrConstants->GetSize();
        m_constantsCount = lenConstants;
        m_constants0 = new uint8_t[(lenConstants + 1) * 32];
        m_constants = reinterpret_cast<uint8_t*>(((uint64_t) m_constants0 + 31) & (~((uint64_t) 31)));
        
        for (int i = 0; i < lenConstants; ++i)
            SetConstant(i, arrConstants->GetDictionary(i));
        
        // copy the code
        m_codeSize = arrCode->GetSize();
        m_code = (uint8_t*) mmap(NULL, m_codeSize, PROT_READ | PROT_WRITE, MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
        for (int i = 0; i < m_codeSize; ++i)
            m_code[i] = (unsigned char) arrCode->GetInt(i);
        mprotect(m_code, m_codeSize, PROT_READ | PROT_EXEC);
    }
    
    void TestExecuteCode(double input[8], double output[8])
    {
        if (!m_code || !m_constants0)
            return;
        
        asm("vmovupd (%0), %%ymm0\n"
            "vmovupd (%1), %%ymm1\n"
            :
            : "r"(input), "r"(input + 4)
            :
        );
        
        (reinterpret_cast<void (*)(uint8_t*)>(m_code))(m_constants);
        
        asm("vmovupd %%ymm0, (%0)\n"
            "vmovupd %%ymm1, (%1)\n"
            :
            : "r"(output), "r"(output + 4)
            :
        );
    }

    void ExecuteCode(
        double xmin, double ymin, double xmax, double ymax,
        double dx, double dy,
        double radius, uint64_t maxIter,
        uint64_t& width, uint64_t& height, uint64_t& size,
        uint8_t** result, uint64_t** histogram, double** zn, double** dzn)
    {
        *result = NULL;
        
        if (histogram)
            *histogram = NULL;
        if (zn)
            *zn = NULL;
        if (dzn)
            *dzn = NULL;

        if (!m_code || !m_constants0)
            return;
        
        long width_4 = (((long) ceil((xmax - xmin) / dx)) + 3) >> 2;
        width = width_4 << 2;
        height = (long) ceil((ymax - ymin) / dy);
        
        SetConstants(0, xmin, xmin + dx, xmin + 2 * dx, xmin + 3 * dx);
        SetConstant(1, (double) ymin);
        SetConstant(2, (double) 4 * dx);
        SetConstant(3, (double) dy);
        SetConstant(4, (double) radius * radius);
        
        // limit the range of maxIter to 14 bits
        if (maxIter <= 0)
            maxIter = 1;
        if (maxIter >= 16384)
            maxIter = 16383;

        /*
        int idx = 0;
        for (int i = 0; i < m_constantsCount; ++i)
        {
            for (int j = 0; j < 4; ++j)
            {
                for (int k = 0; k < 8; ++k)
                    printf("%02X", m_constants[idx++]);
                printf(" ");
            }
            printf("\n");
        }*/
        
        size = width * height;
        *result = new uint8_t[2 * size];
        
        if (histogram)
        {
            *histogram = new uint64_t[maxIter + 1];
            memset(*histogram, 0, (maxIter + 1) * sizeof(uint64_t));
        }
        
        if (zn)
            *zn = new double[size];
        if (dzn)
            *dzn = new double[size];
        
        //uint8_t* res = reinterpret_cast<uint8_t*>(((uint64_t) result + 31) & (~((uint64_t) 31)));
        // printf("result addr = %llx\n", (uint64_t) result);

        // run the jitted code
        // RDI, RSI, RDX, RCX, R8, R9
        (reinterpret_cast<JIT_FUNC>(m_code))(
            m_constants, *result, width_4, height, maxIter,
            histogram ? *histogram : NULL, zn ? *zn : NULL, dzn ? *dzn : NULL
        );

        /*
        double* out = (double*) res;
        printf("ymm0: %.10f, %.10f, %.10f, %.10f\n", out[0], out[1], out[2], out[3]);
        printf("ymm1: %.10f, %.10f, %.10f, %.10f\n", out[4], out[5], out[6], out[7]);
         */
    }
};

JIT* g_jit = new JIT();

typedef struct
{
    CallbackId callback;
    Zephyros::JavaScript::Array ret;
    double xmin;
    double ymin;
    double xmax;
    double ymax;
    double dx;
    double dy;
    double radius;
    uint64_t maxIter;
    bool computeZn;
    bool computeDzn;
    bool computeHistogram;
} execute_code_t;

void* ExecuteCode(void* args)
{
    execute_code_t* arguments = (execute_code_t*) args;
    uint64_t width = 0;
    uint64_t height = 0;
    uint64_t size = 0;
    uint8_t* result = NULL;
    uint64_t* histogram = NULL;
    double* zn = NULL;
    double* dzn = NULL;
    
    // invoke the JITted function
    g_jit->ExecuteCode(
        arguments->xmin, arguments->ymin, arguments->xmax, arguments->ymax,
        arguments->dx, arguments->dy,
        arguments->radius, arguments->maxIter,
        width, height, size,
        &result,
        arguments->computeHistogram ? &histogram : NULL,
        arguments->computeZn ? &zn : NULL,
        arguments->computeDzn ? &dzn : NULL
    );
    
    // prepare the return values
#ifdef USE_THREADS
    Zephyros::JavaScript::Array ret = Zephyros::JavaScript::CreateArray();
#else
    Zephyros::JavaScript::Array ret = arguments->ret;
#endif
    
    ret->SetInt(0, width);
    ret->SetInt(1, height);
    
    if (result)
    {
        ret->SetString(2, String((char*) result, 2 * size));
        delete[] result;
    }
    else
        ret->SetNull(2);
    
    if (zn)
    {
        Zephyros::JavaScript::Array znArray = Zephyros::JavaScript::CreateArray();
        
        for (int i = 0; i <= size; ++i)
            znArray->SetDouble(i, zn[i]);
        
        ret->SetList(3, znArray);
        delete[] zn;
    }
    else
        ret->SetNull(3);
    
    if (dzn)
    {
        Zephyros::JavaScript::Array dznArray = Zephyros::JavaScript::CreateArray();
        
        for (int i = 0; i <= size; ++i)
            dznArray->SetDouble(i, dzn[i]);
        
        ret->SetList(4, dznArray);
        delete[] dzn;
    }
    else
        ret->SetNull(4);
    
    if (histogram)
    {
        Zephyros::JavaScript::Array histogramArray = Zephyros::JavaScript::CreateArray();
        
        for (int i = 0; i <= arguments->maxIter; ++i)
            histogramArray->SetDouble(i, histogram[i]);
        
        ret->SetList(5, histogramArray);
        delete[] histogram;
    }
    else
        ret->SetNull(5);
    
#ifdef USE_THREADS
    // call the callback with the return values
    Zephyros::GetNativeExtensions()->GetClientExtensionHandler()->InvokeCallback(arguments->callback, ret);
#endif

    delete arguments;
    
#ifdef USE_THREADS
    pthread_exit(NULL);
#endif
    
    return NULL;
}

class MandelbrotNativeExtensions : public Zephyros::DefaultNativeExtensions
{
	virtual void AddNativeExtensions(Zephyros::NativeJavaScriptFunctionAdder* extensionHandler)
	{
		// add the default native extensions
		DefaultNativeExtensions::AddNativeExtensions(extensionHandler);

        extensionHandler->AddNativeJavaScriptFunction(
            TEXT("compileCode"),
            FUNC({
                g_jit->CompileCode(args->GetList(0), args->GetList(1));
                return NO_ERROR;
            }
            ARG(VTYPE_LIST, "code")
            ARG(VTYPE_LIST, "constants")
        ));
        
	    extensionHandler->AddNativeJavaScriptFunction(
	        TEXT("executeCode"),
	        FUNC({
#ifdef USE_THREADS
                pthread_t thd;
#endif
                execute_code_t* arguments = new execute_code_t;
                arguments->callback = callback;
            
#ifndef USE_THREADS
                arguments->ret = ret;
#endif
            
                Zephyros::JavaScript::Object options = args->GetDictionary(0);
                arguments->xmin = options->GetDouble(TEXT("xmin"));
                arguments->ymin = options->GetDouble(TEXT("ymin"));
                arguments->xmax = options->GetDouble(TEXT("xmax"));
                arguments->ymax = options->GetDouble(TEXT("ymax"));
                arguments->dx = options->GetDouble(TEXT("dx"));
                arguments->dy = options->GetDouble(TEXT("dy"));
                arguments->radius = options->GetDouble(TEXT("radius"));
                arguments->maxIter = options->GetInt(TEXT("maxIter"));
                arguments->computeZn = options->HasKey(TEXT("computeZn")) && options->GetBool(TEXT("computeZn"));
                arguments->computeDzn = options->HasKey(TEXT("computeDzn")) && options->GetBool(TEXT("computeDzn"));
                arguments->computeHistogram = options->HasKey(TEXT("computeHistogram")) && options->GetBool(TEXT("computeHistogram"));

#ifdef USE_THREADS
                pthread_create(&thd, NULL, ExecuteCode, (void*) arguments);
                return RET_DELAYED_CALLBACK;
#else
                ExecuteCode((void*) arguments);
                return NO_ERROR;
#endif
	        }
            ARG(VTYPE_DICTIONARY, "options")
	    ));
        
        extensionHandler->AddNativeJavaScriptFunction(
            TEXT("testCompileAndExecute"),
            FUNC({
                g_jit->CompileCode(args->GetList(0), args->GetList(1));

                double input[8];
                double output[8];

                Zephyros::JavaScript::Array arrInput = args->GetList(2);
                int lenInput = arrInput->GetSize();
                for (int i = 0; i < 8; ++i)
                    input[i] = i < lenInput ? arrInput->GetDouble(i) : 0;
            
                g_jit->TestExecuteCode(input, output);
                
                Zephyros::JavaScript::Array arrOutput = Zephyros::JavaScript::CreateArray();
                for (int i = 0; i < 8; ++i)
                    arrOutput->SetDouble(i, output[i]);
                ret->SetList(0, arrOutput);

                return NO_ERROR;
            }
            ARG(VTYPE_LIST, "code")
            ARG(VTYPE_LIST, "constants")
            ARG(VTYPE_LIST, "inputs")
        ));
	}
};


int MAIN(MAIN_ARGS)
{
	Zephyros::SetNativeExtensions(new MandelbrotNativeExtensions());
    SetStrings();

    //Zephyros::UseLogging(true);

#ifdef OS_WIN
	Zephyros::SetWindowsInfo(TEXT("Software\\thyante\\Mandelbrot"), IDI_ZEPHYROS_SAMPLEAPP, IDC_ZEPHYROS_SAMPLEAPP, IDC_ZEPHYROS_SAMPLEAPP);
	#include "res\windows\content.cpp"
#endif

#ifdef OS_MACOSX
    Zephyros::SetOSXInfo(TEXT("Localizable"));
#endif

	int ret = Zephyros::Run(RUN_APPLICATION_ARGS, TEXT("Mandelbrot"), TEXT("1.0.0"), TEXT("app/index.html"));
    delete g_jit;
    
    return ret;
}
