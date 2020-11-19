import { writable, get } from "svelte/store";
import type { Ifeed, IfeedInfo } from "../../../common/Feed";
import { getFeed, getFeeds } from "../../../api/rssFeedProxy";

interface IfeedStore {
  feeds: Ifeed[];
}

const initialState: IfeedStore = {
  feeds: []
};
const { subscribe, set, update } = writable(initialState);

const load = async (feedInfos: IfeedInfo[]) => {
  // const loaded = await getFeeds(feedInfos);
  // update((n) => ({ ...n, feeds: loaded }));

  update((n) => ({ ...n, feeds: [] }));

  for (const [i, feedInfo] of feedInfos.entries()) {
    const feed = await getFeed(feedInfo.url);
    update((n) => {
      const before = n.feeds.length;
      n.feeds[i] = feed;
      console.log(before, "->", n.feeds.length);
      return { ...n };
    });
  }
};

const clear = () => set(initialState);

export const feed = {
  subscribe,
  set,
  update,
  load,
  clear
};
