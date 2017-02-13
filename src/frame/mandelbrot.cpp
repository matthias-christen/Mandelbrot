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


class MandelbrotNativeExtensions : public Zephyros::DefaultNativeExtensions
{
private:
    uint8_t* m_code;
    uint8_t* m_constants0;
    uint8_t* m_constants; // 32-byte aligned constants
    size_t m_codeSize;
    
public:
    MandelbrotNativeExtensions()
    {
        m_code = NULL;
        m_constants0 = NULL;
    }
    
    virtual ~MandelbrotNativeExtensions()
    {
        if (m_code)
            munmap(m_code, m_codeSize);
        if (m_constants0)
            delete[] m_constants0;
    }
    
    void CompileCode(Zephyros::JavaScript::Array arrCode, Zephyros::JavaScript::Array arrConstants)
    {
        if (m_code)
            munmap(m_code, m_codeSize);
        if (m_constants0)
            delete[] m_constants0;
        
        // create the constants array
        int lenConstants = arrConstants->GetSize();
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
    
    void SetConstant(int idx, Zephyros::JavaScript::Object constant)
    {
        if (!m_constants0)
            return;
        
        if (!constant->HasKey(TEXT("value")))
            return;
        
        String type = constant->GetString(TEXT("type"));
        CefValueType valueType = constant->GetType(TEXT("value"));
        
        if (type == TEXT("double"))
        {
            if (valueType == VTYPE_LIST)
            {
                double c[4] = {0};
                Zephyros::JavaScript::Array values = constant->GetList(TEXT("value"));
                int len = std::min(4, (int) values->GetSize());
                
                for (int i = 0; i < len; ++i)
                    c[i] = values->GetDouble(i);
                
                SetConstants(idx, c);
            }
            else if (valueType == VTYPE_DOUBLE || valueType == VTYPE_INT)
                SetConstant(idx, constant->GetDouble(TEXT("value")));
        }
        else if (type == TEXT("int64"))
        {
            uint64_t c = constant->GetInt(TEXT("value"));
            for (int i = 0; i < 4; ++i)
                memcpy(m_constants + idx * 32 + i * 8, &c, sizeof(uint64_t));
        }
        else if (type == TEXT("int32"))
        {
            uint32_t c = constant->GetInt(TEXT("value"));
            for (int i = 0; i < 4; ++i)
                memcpy(m_constants + idx * 32 + i * 4, &c, sizeof(uint32_t));
            memset(m_constants + idx * 32 + 16, 0, 4 * sizeof(uint32_t));
        }
        else
            memset(m_constants + idx * 32, 0, 32);
    }
    
    void SetConstant(int idx, double v)
    {
        if (!m_constants0)
            return;

        for (int i = 0; i < 4; ++i)
            memcpy(m_constants + idx * 32 + i * 8, &v, sizeof(double));
    }
    
    void SetConstants(int idx, double v[4])
    {
        if (!m_constants0)
            return;

        for (int i = 0; i < 4; ++i)
            memcpy(m_constants + idx * 32 + i * 8, &v[i], sizeof(double));
    }
    
    uint8_t* ExecuteCode(
        double xmin, double ymin, double xmax, double ymax,
        double dx, double dy,
        double radius,
        long maxIter,
        long& width, long& height, long& size)
    {
        if (!m_code || !m_constants0)
            return NULL;
        
        long width_4 = (((long) ceil((xmax - xmin) / dx)) + 3) >> 2;
        width = width_4 << 2;
        height = (long) ceil((ymax - ymin) / dy);
        
        m_constants[0] = xmin;
        m_constants[1] = xmin + dx;
        m_constants[2] = xmin + 2 * dx;
        m_constants[3] = xmin + 3 * dx;
        
        SetConstant(1, (double) ymin);
        SetConstant(2, (double) 4 * dx);
        SetConstant(3, (double) dy);
        SetConstant(4, (double) radius * radius);

        size = 2 * width * height;
        uint8_t* result = new uint8_t[size];
        printf("result addr = %llx\n", (uint64_t) result);
        
        long args[12] = { width_4, height, maxIter };
        
        // - init %rax with the pointer to the constants
        // - init %rbx with the pointer to the result
        // - init %r10 with xmax (ceil(0.25 * number of points) in x-direction to compute)
        // - init %r12 with ymax
        // - init %r13 with maxIter

        asm("pushq %%r8\n"
            "pushq %%r9\n"
            "pushq %%r10\n"
            "pushq %%r11\n"
            "pushq %%r12\n"
            "pushq %%r13\n"
            "pushq %%r14\n"
            "movq (%%rcx), %%r10\n"
            "movq 8(%%rcx), %%r12\n"
            "movq 16(%%rcx), %%r13\n"
            "callq *%%rdx\n"
            "popq %%r14\n"
            "popq %%r13\n"
            "popq %%r12\n"
            "popq %%r11\n"
            "popq %%r10\n"
            "popq %%r9\n"
            "popq %%r8\n"
            "vmovupd %%ymm0, 32(%%rcx)\n"
            "vmovupd %%ymm1, 64(%%rcx)\n"
            :
            : "a"(m_constants), "b"(result), "c"(args), "d"(m_code)
        );
        
        double* out = (double*) &args[4];
        printf("ymm0: %.10f, %.10f, %.10f, %.10f\n", out[0], out[1], out[2], out[3]);
        printf("ymm1: %.10f, %.10f, %.10f, %.10f\n", out[4], out[5], out[6], out[7]);

        return result;
    }
    
	virtual void AddNativeExtensions(Zephyros::NativeJavaScriptFunctionAdder* extensionHandler)
	{
		// add the default native extensions
		DefaultNativeExtensions::AddNativeExtensions(extensionHandler);

        extensionHandler->AddNativeJavaScriptFunction(
            TEXT("compileCode"),
            FUNC({
                ((MandelbrotNativeExtensions*) Zephyros::GetNativeExtensions())->CompileCode(args->GetList(0), args->GetList(1));
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
            
                uint8_t* result = ((MandelbrotNativeExtensions*) Zephyros::GetNativeExtensions())->ExecuteCode(
                    args->GetDouble(0), args->GetDouble(1), args->GetDouble(2), args->GetDouble(3),
                    args->GetDouble(4), args->GetDouble(5),
                    args->GetDouble(6),
                    args->GetInt(7),
                    width, height, size
                );
            
                ret->SetInt(0, width);
                ret->SetInt(1, height);
                ret->SetString(2, String((char*) result, size));
            
                delete[] result;
            
	            return NO_ERROR;
	        }
            ARG(VTYPE_DOUBLE, "xmin")
            ARG(VTYPE_DOUBLE, "ymin")
            ARG(VTYPE_DOUBLE, "xmax")
            ARG(VTYPE_DOUBLE, "ymax")
            ARG(VTYPE_DOUBLE, "dx")
            ARG(VTYPE_DOUBLE, "dy")
            ARG(VTYPE_DOUBLE, "radius")
            ARG(VTYPE_INT, "maxIter")
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
