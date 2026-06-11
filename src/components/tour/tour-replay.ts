// One-shot replay request, passed between the Settings page and the
// AppTours controller via sessionStorage (survives the client-side
// navigation back to "/", cleared once consumed).

const REPLAY_KEY = "asafe-tour-replay";

export function requestTourReplay(tour: string) {
  try {
    sessionStorage.setItem(REPLAY_KEY, tour);
  } catch {
    // storage unavailable (private mode etc.) — replay silently no-ops
  }
}

export function consumeTourReplay(): string | null {
  try {
    const tour = sessionStorage.getItem(REPLAY_KEY);
    if (tour) sessionStorage.removeItem(REPLAY_KEY);
    return tour;
  } catch {
    return null;
  }
}
