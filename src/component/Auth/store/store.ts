import { writable, get } from "svelte/store";
import type { Iuser } from "../../../common/Auth";

interface IauthStore {
  user: Iuser;
}

const initialState: IauthStore = {
  user: null
};
const { subscribe, set, update } = writable(initialState);

export const auth = {
  subscribe,
  set,
  update,
  login: (user: Iuser) => update((n) => ({ ...n, user })),
  logout: () => set(initialState)
};
