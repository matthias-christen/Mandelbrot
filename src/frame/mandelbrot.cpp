/*******************************************************************************
 * Copyright (c) 2015 Vanamco AG, http://www.vanamco.com
 *
 * The MIT License (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Contributors:
 * Matthias Christen, Vanamco AG
 *******************************************************************************/

#include <sys/mman.h>
#include <math.h>
#include <algorithm>

#include "stdafx.h"
#include "mandelbrot_strings.h"

#ifdef OS_WIN
#include "Resource.h"
#endif

#define PAGE_SIZE 4096


typedef void (*JIT_FUNC)(uint8_t*, uint8_t*, long, long, long);


class JIT
{
private:
    uint8_t* m_code;
    uint8_t* m_constants0;
    uint8_t* m_constants; // 32-byte aligned constants
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

    uint8_t* ExecuteCode(Zephyros::JavaScript::Object options, long& width, long& height, long& size)
    {
        if (!m_code || !m_constants0)
            return NULL;
        
        double xmin = options->GetDouble(TEXT("xmin"));
        double ymin = options->GetDouble(TEXT("ymin"));
        double xmax = options->GetDouble(TEXT("xmax"));
        double ymax = options->GetDouble(TEXT("ymax"));
        double dx = options->GetDouble(TEXT("dx"));
        double dy = options->GetDouble(TEXT("dy"));
        double radius = options->GetDouble(TEXT("radius"));
        long maxIter = options->GetInt(TEXT("maxIter"));
        
        long width_4 = (((long) ceil((xmax - xmin) / dx)) + 3) >> 2;
        width = width_4 << 2;
        height = (long) ceil((ymax - ymin) / dy);
        
        SetConstants(0, xmin, xmin + dx, xmin + 2 * dx, xmin + 3 * dx);
        SetConstant(1, (double) ymin);
        SetConstant(2, (double) 4 * dx);
        SetConstant(3, (double) dy);
        SetConstant(4, (double) radius * radius);
        
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
        
        size = 2 * width * height;
        uint8_t* result = new uint8_t[2*size];
        //uint8_t* res = reinterpret_cast<uint8_t*>(((uint64_t) result + 31) & (~((uint64_t) 31)));
        // printf("result addr = %llx\n", (uint64_t) result);
        
        // run the jitted code
        // RDI, RSI, RDX, RCX, R8
        (reinterpret_cast<JIT_FUNC>(m_code))(m_constants, result, width_4, height, maxIter);
        
        /*
        double* out = (double*) res;
        printf("ymm0: %.10f, %.10f, %.10f, %.10f\n", out[0], out[1], out[2], out[3]);
        printf("ymm1: %.10f, %.10f, %.10f, %.10f\n", out[4], out[5], out[6], out[7]);
         */
        
        return result;
    }
};

JIT* g_jit = new JIT();


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
                long width = 0;
                long height = 0;
                long size = 0;
            
                uint8_t* result = g_jit->ExecuteCode(args->GetDictionary(0), width, height, size);
            
                ret->SetInt(0, width);
                ret->SetInt(1, height);

                if (result)
                {
                    ret->SetString(2, String((char*) result, size));
                    delete[] result;
                }
                else
                    ret->SetNull(2);

	            return NO_ERROR;
	        }
            ARG(VTYPE_DICTIONARY, "options")
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

	return Zephyros::Run(RUN_APPLICATION_ARGS, TEXT("Mandelbrot"), TEXT("1.0.0"), TEXT("app/index.html"));
}
