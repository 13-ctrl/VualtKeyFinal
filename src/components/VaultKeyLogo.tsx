/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

export const VaultKeyLogo = ({ className = "w-24 h-24" }: { className?: string }) => {
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* Padlock Shackle */}
      <div className="absolute top-0 w-1/2 h-1/2 border-[6px] border-[#4fd1c5] rounded-t-full opacity-80" />
      
      {/* Padlock Body */}
      <div className="absolute bottom-0 w-full h-3/4 bg-[#0d1b1e] border-2 border-[#4fd1c5]/40 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(79,209,197,0.2)]">
        {/* Terminal Screen Background */}
        <div className="absolute inset-0 bg-[#0a1416] flex flex-col p-2 font-mono text-[8px] leading-tight overflow-hidden select-none opacity-40">
          <div className="text-[#4fd1c5]/60 whitespace-pre">
            {`> _  VI?% 6 .i?h|g 1\n S%      aI' & && DI\n<<U   >_       ?Z_\n j S           _mD\n-w#            :D_\n$_|   u:  ""   !@\n0i? . "" ..   >>$\n ' ?X ${'{0v_ }}'} |`}
          </div>
        </div>

        {/* Glowing Terminal Prompt */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1">
            <span className="text-[#4fd1c5] text-2xl font-bold text-glow">{'>'}</span>
            <motion.div 
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="w-3 h-1 bg-[#4fd1c5] mt-3"
            />
          </div>
        </div>

        {/* Glass Reflection */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
      </div>
    </div>
  );
};

export const VaultKeyBrand = () => {
  return (
    <div className="flex flex-col items-center gap-2">
      <VaultKeyLogo className="w-32 h-32" />
      <div className="text-center mt-4">
        <h1 className="text-5xl font-bold tracking-tight text-[#f0f4f5] text-glow">VaultKey</h1>
        <p className="text-sm tracking-[0.4em] text-[#4fd1c5] uppercase font-medium opacity-80 mt-1">CLI SIMULATION</p>
      </div>
    </div>
  );
};
