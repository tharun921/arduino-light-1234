/**
 * AVR Instruction Set - Decoder and Executors
 * 
 * Implements essential AVR instructions for Arduino compatibility.
 * Instructions are 16-bit opcodes in little-endian format.
 * 
 * Priority instructions for basic Arduino functionality:
 * - LDI (Load Immediate)
 * - OUT/IN (I/O operations for digitalWrite/digitalRead)
 * - STS/LDS (Store/Load to/from SRAM)
 * - RJMP/JMP (Jumps for loops)
 * - CALL/RET (Function calls)
 * - ADD/SUB/INC/DEC (Arithmetic)
 */

import type { AVREmulator } from './AVREmulator';

/**
 * Main instruction decoder and executor
 */
export function decodeAndExecute(opcode: number, emu: AVREmulator): void {
    // Extract opcode bits for classification
    const op = (opcode >> 12) & 0xF;  // Top 4 bits
    const nibble = (opcode >> 8) & 0xF;

    // ===== DATA TRANSFER INSTRUCTIONS =====

    // LDI - Load Immediate to Register (Rd, K)
    // 1110 KKKK dddd KKKK
    if ((opcode & 0xF000) === 0xE000) {
        const d = 16 + ((opcode >> 4) & 0x0F); // Rd (R16-R31 only)
        const K = ((opcode & 0x0F00) >> 4) | (opcode & 0x000F);
        emu.registers[d] = K;
        console.log(`  LDI R${d}, 0x${K.toString(16).toUpperCase()}`);
        return;
    }

    // OUT - Store Register to I/O (A, Rr)
    // 1011 1AAr rrrr AAAA
    if ((opcode & 0xF800) === 0xB800) {
        const r = (opcode >> 4) & 0x1F;
        const A = ((opcode & 0x0600) >> 5) | (opcode & 0x000F);
        emu.writeIO(A, emu.registers[r]);
        console.log(`  OUT 0x${A.toString(16).toUpperCase()}, R${r}`);
        return;
    }

    // IN - Load from I/O to Register (Rd, A)
    // 1011 0AAd dddd AAAA
    if ((opcode & 0xF800) === 0xB000) {
        const d = (opcode >> 4) & 0x1F;
        const A = ((opcode & 0x0600) >> 5) | (opcode & 0x000F);
        emu.registers[d] = emu.readIO(A);
        console.log(`  IN R${d}, 0x${A.toString(16).toUpperCase()}`);
        return;
    }

    // STS - Store Direct to SRAM (k, Rr) [32-bit instruction]
    // 1001 001r rrrr 0000 kkkk kkkk kkkk kkkk
    if ((opcode & 0xFE0F) === 0x9200) {
        const r = (opcode >> 4) & 0x1F;
        // Next word contains the 16-bit address
        const addrLow = emu.flash[emu.pc];
        const addrHigh = emu.flash[emu.pc + 1];
        const addr = (addrHigh << 8) | addrLow;
        emu.pc += 2;  // STS is a 32-bit instruction

        if (addr < emu.sram.length) {
            emu.sram[addr] = emu.registers[r];
            console.log(`  STS 0x${addr.toString(16).toUpperCase()}, R${r}`);
        }
        return;
    }

    // LDS - Load Direct from SRAM (Rd, k) [32-bit instruction]
    // 1001 000d dddd 0000 kkkk kkkk kkkk kkkk
    if ((opcode & 0xFE0F) === 0x9000) {
        const d = (opcode >> 4) & 0x1F;
        const addrLow = emu.flash[emu.pc];
        const addrHigh = emu.flash[emu.pc + 1];
        const addr = (addrHigh << 8) | addrLow;
        emu.pc += 2;

        if (addr < emu.sram.length) {
            emu.registers[d] = emu.sram[addr];
            console.log(`  LDS R${d}, 0x${addr.toString(16).toUpperCase()}`);
        }
        return;
    }

    // ===== ARITHMETIC INSTRUCTIONS =====

    // ADD - Add without Carry (Rd, Rr)
    // 0000 11rd dddd rrrr
    if ((opcode & 0xFC00) === 0x0C00) {
        const d = (opcode >> 4) & 0x1F;
        const r = ((opcode & 0x0200) >> 5) | (opcode & 0x000F);
        const result = emu.registers[d] + emu.registers[r];
        emu.registers[d] = result & 0xFF;
        emu.updateZeroNegativeFlags(result);
        console.log(`  ADD R${d}, R${r}`);
        return;
    }

    // SUB - Subtract without Carry (Rd, Rr)
    // 0001 10rd dddd rrrr
    if ((opcode & 0xFC00) === 0x1800) {
        const d = (opcode >> 4) & 0x1F;
        const r = ((opcode & 0x0200) >> 5) | (opcode & 0x000F);
        const result = emu.registers[d] - emu.registers[r];
        emu.registers[d] = result & 0xFF;
        emu.updateZeroNegativeFlags(result);
        console.log(`  SUB R${d}, R${r}`);
        return;
    }

    // INC - Increment (Rd)
    // 1001 010d dddd 0011
    if ((opcode & 0xFE0F) === 0x9403) {
        const d = (opcode >> 4) & 0x1F;
        emu.registers[d] = (emu.registers[d] + 1) & 0xFF;
        emu.updateZeroNegativeFlags(emu.registers[d]);
        console.log(`  INC R${d}`);
        return;
    }

    // DEC - Decrement (Rd)
    // 1001 010d dddd 1010
    if ((opcode & 0xFE0F) === 0x940A) {
        const d = (opcode >> 4) & 0x1F;
        emu.registers[d] = (emu.registers[d] - 1) & 0xFF;
        emu.updateZeroNegativeFlags(emu.registers[d]);
        console.log(`  DEC R${d}`);
        return;
    }

    // ===== LOGICAL INSTRUCTIONS =====

    // AND - Logical AND (Rd, Rr)
    // 0010 00rd dddd rrrr
    if ((opcode & 0xFC00) === 0x2000) {
        const d = (opcode >> 4) & 0x1F;
        const r = ((opcode & 0x0200) >> 5) | (opcode & 0x000F);
        emu.registers[d] &= emu.registers[r];
        emu.updateZeroNegativeFlags(emu.registers[d]);
        console.log(`  AND R${d}, R${r}`);
        return;
    }

    // OR - Logical OR (Rd, Rr)
    // 0010 10rd dddd rrrr
    if ((opcode & 0xFC00) === 0x2800) {
        const d = (opcode >> 4) & 0x1F;
        const r = ((opcode & 0x0200) >> 5) | (opcode & 0x000F);
        emu.registers[d] |= emu.registers[r];
        emu.updateZeroNegativeFlags(emu.registers[d]);
        console.log(`  OR R${d}, R${r}`);
        return;
    }

    // EOR - Exclusive OR (Rd, Rr)
    // 0010 01rd dddd rrrr
    if ((opcode & 0xFC00) === 0x2400) {
        const d = (opcode >> 4) & 0x1F;
        const r = ((opcode & 0x0200) >> 5) | (opcode & 0x000F);
        emu.registers[d] ^= emu.registers[r];
        emu.updateZeroNegativeFlags(emu.registers[d]);
        console.log(`  EOR R${d}, R${r}`);
        return;
    }

    // ===== BRANCH INSTRUCTIONS =====

    // RJMP - Relative Jump (k)
    // 1100 kkkk kkkk kkkk
    if ((opcode & 0xF000) === 0xC000) {
        let k = opcode & 0x0FFF;
        // Sign extend 12-bit to 16-bit
        if (k & 0x0800) k |= 0xF000;
        // Convert to signed 16-bit
        const offset = (k << 16) >> 16;
        emu.pc += offset * 2;
        console.log(`  RJMP ${offset >= 0 ? '+' : ''}${offset}`);
        return;
    }

    // BREQ - Branch if Equal (k)
    // 1111 01kk kkkk k001
    if ((opcode & 0xFC07) === 0xF001) {
        if (emu.getFlag(1)) { // Z flag
            let k = (opcode >> 3) & 0x7F;
            if (k & 0x40) k |= 0xFF80; // Sign extend
            const offset = (k << 16) >> 16;
            emu.pc += offset * 2;
            console.log(`  BREQ ${offset >= 0 ? '+' : ''}${offset} (taken)`);
        } else {
            console.log(`  BREQ (not taken)`);
        }
        return;
    }

    // BRNE - Branch if Not Equal (k)
    // 1111 01kk kkkk k001
    if ((opcode & 0xFC07) === 0xF401) {
        if (!emu.getFlag(1)) { // Z flag
            let k = (opcode >> 3) & 0x7F;
            if (k & 0x40) k |= 0xFF80;
            const offset = (k << 16) >> 16;
            emu.pc += offset * 2;
            console.log(`  BRNE ${offset >= 0 ? '+' : ''}${offset} (taken)`);
        } else {
            console.log(`  BRNE (not taken)`);
        }
        return;
    }

    // ===== CALL/RETURN INSTRUCTIONS =====

    // CALL - Long Call to Subroutine [32-bit]
    // 1001 010k kkkk 111k kkkk kkkk kkkk kkkk
    if ((opcode & 0xFE0E) === 0x940E) {
        const k1 = opcode & 0x01F0;
        const addrLow = emu.flash[emu.pc];
        const addrHigh = emu.flash[emu.pc + 1];
        const k2 = (addrHigh << 8) | addrLow;
        const addr = (k1 << 13) | k2;

        // Push return address (PC + 4, since CALL is 32-bit)
        const retAddr = (emu.pc + 2) / 2; // Word address
        emu.push((retAddr >> 8) & 0xFF);
        emu.push(retAddr & 0xFF);

        emu.pc = addr * 2; // Convert word address to byte address
        console.log(`  CALL 0x${addr.toString(16).toUpperCase()}`);
        return;
    }

    // RET - Return from Subroutine
    // 1001 0101 0000 1000
    if (opcode === 0x9508) {
        const retLow = emu.pop();
        const retHigh = emu.pop();
        const retAddr = ((retHigh << 8) | retLow) * 2; // Convert to byte address
        emu.pc = retAddr;
        console.log(`  RET (return to 0x${retAddr.toString(16).toUpperCase()})`);
        return;
    }

    // ===== STACK OPERATIONS =====

    // PUSH - Push Register on Stack
    // 1001 001r rrrr 1111
    if ((opcode & 0xFE0F) === 0x920F) {
        const r = (opcode >> 4) & 0x1F;
        emu.push(emu.registers[r]);
        console.log(`  PUSH R${r}`);
        return;
    }

    // POP - Pop Register from Stack
    // 1001 000r rrrr 1111
    if ((opcode & 0xFE0F) === 0x900F) {
        const r = (opcode >> 4) & 0x1F;
        emu.registers[r] = emu.pop();
        console.log(`  POP R${r}`);
        return;
    }

    // ===== SPECIAL INSTRUCTIONS =====

    // NOP - No Operation
    // 0000 0000 0000 0000
    if (opcode === 0x0000) {
        console.log(`  NOP`);
        return;
    }

    // RETI - Return from Interrupt
    // 1001 0101 0001 1000
    if (opcode === 0x9518) {
        const retLow = emu.pop();
        const retHigh = emu.pop();
        const retAddr = ((retHigh << 8) | retLow) * 2;
        emu.pc = retAddr;
        emu.setFlag(7); // Enable global interrupts (I flag)
        console.log(`  RETI`);
        return;
    }

    // Unknown instruction
    console.warn(`⚠️ Unknown opcode: 0x${opcode.toString(16).toUpperCase().padStart(4, '0')}`);
    console.warn(`   This instruction is not yet implemented. Treating as NOP.`);
}
