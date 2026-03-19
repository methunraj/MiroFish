import type { Variants, Transition } from "framer-motion";

const PIXEL_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const pageTransition: Transition = {
  duration: 0.3,
  ease: PIXEL_EASE,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: PIXEL_EASE } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: PIXEL_EASE },
  },
};

export const slidePanel: Variants = {
  hidden: { x: "100%" },
  visible: {
    x: 0,
    transition: { type: "spring", damping: 25, stiffness: 300 },
  },
  exit: { x: "100%", transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: PIXEL_EASE },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } },
};
