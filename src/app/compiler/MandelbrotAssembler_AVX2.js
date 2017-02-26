function MandelbrotAssembler(instructions)
{
    Assembler.call(this, instructions);
}

MandelbrotAssembler.prototype = new Assembler();


MandelbrotAssembler.prototype.run = function()
{
    // registers:

    // - initialized by caller:
    // (Unix / Windows)
    // %rdi / %rcx: pointer to constants
    // %rsi / %rdx: pointer to results
    // %rdx / %r8: width/4 (xmax)
    // %rcx / %r9: height (ymax and y-counter)
    // %r8: maxIter

    // - internal usage:
    // %rax: iteration count (counts down from maxIter to 0)
    // %rbx: comparison mask
    // %r10: current escape count
    // %r11: x-counter
    // %r14, %r15: temporary

    // constants:
    // 0x00: xmin
    // 0x20: ymin
    // 0x40: 4*dx
    // 0x60: dy
    // 0x80: radius


    // prologue
    this.code.push(
        0x53,                         // push   rbx
        0x41, 0x56,                   // push   r14
        0x41, 0x57,                   // push   r15

        0xc5, 0xfd, 0x28, 0x5f, 0x20  // vmovapd ymm3,YMMWORD PTR [rdi+0x20]
    );

    this.addLabel('NEXT_Y');
    this.code.push(
                                      // NEXT_Y:
        0xc5, 0xfd, 0x28, 0x17,       // vmovapd ymm2,YMMWORD PTR [rdi]
        0x49, 0x89, 0xd3              // mov     r11,rdx
    );

    this.addLabel('NEXT_X');
    this.code.push(
                                      // NEXT_X:
        0xc5, 0xfd, 0x57, 0xc0,       // vxorpd ymm0,ymm0,ymm0
        0xc5, 0xf5, 0x57, 0xc9,       // vxorpd ymm1,ymm1,ymm1
        0x4c, 0x89, 0xc0,             // mov    rax,r8
        0x4d, 0x31, 0xd2,             // xor    r10,r10
        0x48, 0x31, 0xdb              // xor    rbx,rbx
    );


    // iteration loop
    this.addLabel('NEXT_ITER');
    Assembler.prototype.run.call(this);


    // epilogue
    this.code.push(
        0x48, 0x09, 0xdb,             // or     rbx,rbx
                                      // jz EXIT
        0x0f, 0x84, this.getLabelRef('EXIT'),

        0x49, 0x89, 0xdf,             // mov    r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,       // shl    rbx,0xf
        0x49, 0x09, 0xdf,             // or     r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,       // shl    rbx,0xf
        0x49, 0x09, 0xdf,             // or     r15,rbx
        0x48, 0xc1, 0xe3, 0x0f,       // shl    rbx,0xf
        0x49, 0x09, 0xdf,             // or     r15,rbx
                                      // movabs rbx,0x1000100010001
        0x48, 0xbb, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x49, 0x21, 0xdf,             // and    r15,rbx
        0x4d, 0x01, 0xfa,             // add    r10,r15
        0x48, 0xff, 0xc8,             // dec    rax

                                      // jnz NEXT_ITER
        0x0f, 0x85, this.getLabelRef('NEXT_ITER')
    );

    this.addLabel('EXIT');
    this.code.push(
        0x4d, 0x89, 0xd6,             // mov    r14,r10
        0x49, 0xd1, 0xe6,             // shl    r14,1
                                      // movabs rbx,0x7f007f007f007f
        0x48, 0xbb, 0x7f, 0x00, 0x7f, 0x00, 0x7f, 0x00, 0x7f, 0x00,
        0x49, 0x21, 0xda,             // and    r10,rbx
        0x48, 0xc1, 0xe3, 0x08,       // shl    rbx,0x8
        0x49, 0x21, 0xde,             // and    r14,rbx
        0x4d, 0x09, 0xf2,             // or     r10,r14
        0x4c, 0x89, 0x16,             // mov    QWORD PTR [rsi],r10
        0x48, 0x83, 0xc6, 0x08,       // add    rsi,0x8

        0xc5, 0xed, 0x58, 0x57, 0x40, // vaddpd ymm2,ymm2,YMMWORD PTR [rdi+0x40]
        0x49, 0xff, 0xcb,             // dec    r11
                                      // jnz NEXT_X
        0x0f, 0x85, this.getLabelRef('NEXT_X'),

        0xc5, 0xe5, 0x58, 0x5f, 0x60, // vaddpd ymm3,ymm3,YMMWORD PTR [rdi+0x60]
        0x48, 0xff, 0xc9,             // dec    rcx
                                      // jnz NEXT_Y
        0x0f, 0x85, this.getLabelRef('NEXT_Y'),

        0x41, 0x5f,                   // pop    r15
        0x41, 0x5e,                   // pop    r14
        0x5b,                         // pop    rbx

        0xc3                          // ret
    );

    this.resolveLabels();
};
