import admin from "./admin";
import auth from "./auth";
import common from "./common";
import demo from "./demo";
import landing from "./landing";
import officer from "./officer";
import resident from "./resident";
import timeline from "./timeline";

/** English is the master dictionary. Other languages are partial and fall back to English key by key. */
const en = { ...common, ...landing, ...auth, ...resident, ...officer, ...admin, ...demo, ...timeline };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export default en;
