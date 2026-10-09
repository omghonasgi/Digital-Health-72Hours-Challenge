type Listener = () => void;
const listeners = new Set<Listener>();

/** Fired when a task changes outside the focused screen (e.g. "Done" tapped on a notification). */
export const planChanged = {
  emit: () => listeners.forEach((l) => l()),
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
