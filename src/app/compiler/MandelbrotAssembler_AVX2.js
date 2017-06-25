/**
 * options: {
 *     returnZn?: boolean;
 *     returnDzn?: boolean;
 *     computeHistogram?: boolean;
 * }
 */
function MandelbrotAssembler(instructions, options)
{
    this.options = options || {};
    Assembler.call(this, instructions);
}

MandelbrotAssembler.prototype = new Assembler();


MandelbrotAssembler.prototype.run = function()
{
    // registers:

    // - initialized by caller:
    // (https://en.wikipedia.org/wiki/X86_calling_conventions#x86-64_calling_conventions)
    // (Unix / Windows)
    // %rdi / %rcx: pointer to constants
    // %rsi / %rdx: pointer to results
    // %rdx / %r8: width/4 (xmax)
    // %rcx / %r9: height (ymax and y-counter)
    // %r8 / stack: maxIter
    // %r9 / stack: histogram
    // stack: pointer to z_n
    // stack: pointer to dz_n

    // - internal usage:
    // %rax: iteration count (counts down from maxIter to 0)
    // %rbx: comparison mask
    // %r10: current escape count
    // %r11: x-counter
    // %r12: pointer to z_n
    // %r13: pointer to dz_n
    // %r14, %r15: temporary

    // constants:
    // 0x00: xmin
    // 0x20: ymin
    // 0x40: 4*dx
    // 0x60: dy
    // 0x80: radius


    var isWindows = navigator.userAgent.indexOf('Windows') >= 0;

    // prologue
    if (isWindows)
    {
        // Windows: move argument registers to the ones used by Unix
        this.code.push(
            0x57,                         // push   rdi
            0x56,                         // push   rsi
            0x48, 0x89, 0xcf,             // mov    rdi,rcx
            0x48, 0x89, 0xd6,             // mov    rsi,rdx
            0x4c, 0x89, 0xc2,             // mov    rdx,r8
            0x4c, 0x89, 0xc9,             // mov    rcx,r9
            0x4c, 0x8b, 0x44, 0x24, 0x18, // mov    r8,QWORD PTR [rsp+0x18] ; maxIter
            0x4c, 0x8b, 0x4c, 0x24, 0x20  // mov    r9,QWORD PTR [rsp+0x20] ; histogram
        );
    }

    this.code.push(
        // save registers
        0x53,                             // push   rbx
        0x41, 0x54,                       // push   r12
        0x41, 0x55,                       // push   r13
        0x41, 0x56,                       // push   r14
        0x41, 0x57,                       // push   r15

        // pointer to z_n
        0x4c, 0x8b, 0x64, 0x24,           // mov    r12,QWORD PTR [rsp+0x30]
            isWindows ? 0x40 : 0x30,

        // pointer to dz_n
        0x4c, 0x8b, 0x6c, 0x24,           // mov    r13,QWORD PTR [rsp+0x38]
            isWindows ? 0x48 : 0x38,          

        // c <- (Re(c), Im(c0))
        0xc5, 0xfd, 0x28, 0x5f, 0x20      // vmovapd ymm3,YMMWORD PTR [rdi+0x20]
    );

    this.addLabel('NEXT_Y');
    this.code.push(
                                          // NEXT_Y:
        // c <- (Re(c0), Im(c))
        0xc5, 0xfd, 0x28, 0x17,           // vmovapd ymm2,YMMWORD PTR [rdi]

        // xCounter <- xmax
        0x49, 0x89, 0xd3                  // mov     r11,rdx
    );

    this.addLabel('NEXT_X');
    this.code.push(
                                          // NEXT_X:
        // z <- 0
        0xc5, 0xfd, 0x57, 0xc0,           // vxorpd ymm0,ymm0,ymm0
        0xc5, 0xf5, 0x57, 0xc9,           // vxorpd ymm1,ymm1,ymm1

        // iterCount <- maxIter
        0x4c, 0x89, 0xc0,                 // mov    rax,r8

        // iters <- 0
        0x4d, 0x31, 0xd2,                 // xor    r10,r10
        0x48, 0x31, 0xdb                  // xor    rbx,rbx
    );


    // iteration loop
    this.addLabel('NEXT_ITER');
    Assembler.prototype.run.call(this);


    // epilogue: process the result
    this.code.push(
        // test if all orbits have escaped
        0x48, 0x09, 0xdb,                 // or     rbx,rbx
                                          // jz EXIT
        0x0f, 0x84, this.getLabelRef('EXIT'),

        // %rbx contains the test results (bits 0:3): abcd
        // in %r15, create the bits spaced apart so %r15 can be used to increment the counter,
        // 00..00a 00..00b 00..00c 00..00d
        0x49, 0x89, 0xdf,                 // mov    r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,           // shl    rbx,0xf
        0x49, 0x09, 0xdf,                 // or     r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,           // shl    rbx,0xf
        0x49, 0x09, 0xdf,                 // or     r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,           // shl    rbx,0xf
        0x49, 0x09, 0xdf,                 // or     r15,rbx
                                          // movabs rbx,0x1000100010001
        0x48, 0xbb, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x49, 0x21, 0xdf,                 // and    r15,rbx

        // increment the counter
        0x4d, 0x01, 0xfa,                 // add    r10,r15

        // decrement the iteration count and go to the next iteration
        0x48, 0xff, 0xc8,                 // dec    rax

                                          // jnz NEXT_ITER
        0x0f, 0x85, this.getLabelRef('NEXT_ITER')
    );

    this.addLabel('EXIT');

    if (this.options.computeHistogram)
    {
        // update the histogram
        this.code.push(
            // pixel 1
            0x4d, 0x89, 0xd6,             // mov    r14,r10
                                          // and    r14,0xffff
            0x49, 0x81, 0xe6, 0xff, 0xff, 0x00, 0x00,

            // increment the histogram bin (in histogram[count])
            0x4b, 0xff, 0x04, 0xf1,       // inc    QWORD PTR [r9+r14*8]

            // pixel 2
            0x4d, 0x89, 0xd6,             // mov    r14,r10
            0x49, 0xc1, 0xee, 0x10,       // shr    r14,0x10
                                          // and    r14,0xffff
            0x49, 0x81, 0xe6, 0xff, 0xff, 0x00, 0x00,    
            0x4b, 0xff, 0x04, 0xf1,       // inc    QWORD PTR [r9+r14*8]

            // pixel 3
            0x4d, 0x89, 0xd6,             // mov    r14,r10
            0x49, 0xc1, 0xee, 0x20,       // shr    r14,0x20
            0x49, 0x81, 0xe6, 0xff, 0xff, 0x00, 0x00,
            0x4b, 0xff, 0x04, 0xf1,       // inc    QWORD PTR [r9+r14*8]

            // pixel 4
            0x4d, 0x89, 0xd6,             // mov    r14,r10
            0x49, 0xc1, 0xee, 0x30,       // shr    r14,0x30
            0x49, 0x81, 0xe6, 0xff, 0xff, 0x00, 0x00,
            0x4b, 0xff, 0x04, 0xf1        // inc    QWORD PTR [r9+r14*8]
        );
    }

    this.code.push(
        // convert the iteration count to base 128 (to be used in JavaScript strings)
        0x4d, 0x89, 0xd6,                 // mov    r14,r10
        0x49, 0xd1, 0xe6,                 // shl    r14,1
                                          // movabs rbx,0x7f007f007f007f
        0x48, 0xbb, 0x7f, 0x00, 0x7f, 0x00, 0x7f, 0x00, 0x7f, 0x00,
        0x49, 0x21, 0xda,                 // and    r10,rbx
        0x48, 0xc1, 0xe3, 0x08,           // shl    rbx,0x8
        0x49, 0x21, 0xde,                 // and    r14,rbx
        0x4d, 0x09, 0xf2,                 // or     r10,r14
        0x4c, 0x89, 0x16,                 // mov    QWORD PTR [rsi],r10
        0x48, 0x83, 0xc6, 0x08,           // add    rsi,0x8

        // next x
        0xc5, 0xed, 0x58, 0x57, 0x40,     // vaddpd ymm2,ymm2,YMMWORD PTR [rdi+0x40]
        0x49, 0xff, 0xcb,                 // dec    r11
                                          // jnz NEXT_X
        0x0f, 0x85, this.getLabelRef('NEXT_X'),

        // next y
        0xc5, 0xe5, 0x58, 0x5f, 0x60,     // vaddpd ymm3,ymm3,YMMWORD PTR [rdi+0x60]
        0x48, 0xff, 0xc9,                 // dec    rcx
                                          // jnz NEXT_Y
        0x0f, 0x85, this.getLabelRef('NEXT_Y'),

        // restore registers
        0x41, 0x5f,                       // pop    r15
        0x41, 0x5e,                       // pop    r14
        0x41, 0x5d,                       // pop    r13
        0x41, 0x5c,                       // pop    r12
        0x5b                              // pop    rbx
    );

    if (isWindows)
    {
        // restore additional registers on Windows
        this.code.push(
            0x5e,                         // pop    rsi
            0x5f                          // pop    rdi
        );
    }

    this.code.push(
        0xc3                              // ret
    );

    this.resolveLabels();
};
