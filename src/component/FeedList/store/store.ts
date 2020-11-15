import { writable, get } from "svelte/store";
import type { Ifeed, IfeedInfo } from "../../../common/Feed";
import { getFeeds } from "../../../api/rssFeedProxy";

interface IfeedStore {
  feeds: Ifeed[];
}

const initialState: IfeedStore = {
  feeds: []
};
const { subscribe, set, update } = writable(initialState);

const load = async (feedInfos: IfeedInfo[]) => {
  const loaded = await getFeeds(feedInfos);
  update((n) => ({ ...n, feeds: loaded }));
};

const clear = () => set(initialState);

export const feed = {
  subscribe,
  set,
  update,
  load,
  clear
};
