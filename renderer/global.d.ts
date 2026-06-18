/// <reference types="electron" />

import type { FourScreenApi } from "../shared/ipc";

declare global {
  interface Window {
    fourScreen: FourScreenApi;
  }
}

export {};
