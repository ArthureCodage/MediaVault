import { useState } from 'react';
import { motion } from 'framer-motion';
import UploadModal from './UploadModal';
import { useIsDesktop } from '../hooks/useMediaQuery';

function UploadFAB() {
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className={`fixed z-40 w-14 h-14 rounded-full bg-mv-accent hover:bg-mv-accent-hover text-white text-2xl shadow-lg shadow-mv-accent/25 flex items-center justify-center transition-colors ${
          isDesktop ? 'bottom-6 right-6' : 'bottom-[76px] right-4'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Upload files"
      >
        +
      </motion.button>

      {open && <UploadModal onClose={() => setOpen(false)} />}
    </>
  );
}

export default UploadFAB;
