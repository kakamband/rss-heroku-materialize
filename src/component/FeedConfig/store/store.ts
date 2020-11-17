import { v4 as uuidv4 } from "uuid";
import { writable, get } from "svelte/store";
import type { IfeedInfo } from "../../../common/Feed";
import { putFeedInfos, getFeedInfos } from "../../../api/rssFeedProxy";

interface IfeedInfoStore {
  items: IfeedInfo[];
  editingIndex: number;
  editingItem: IfeedInfo;
}

const initialState: IfeedInfoStore = {
  items: [],
  editingIndex: -1,
  editingItem: null
};
const { subscribe, set, update } = writable(initialState);

const load = async (uid: string) => {
  const loaded = await getFeedInfos(uid);
  update((n) => ({ ...n, items: loaded }));
};

const add = () => {
  const id = uuidv4();
  const newItem = {
    id,
    url: "",
    title: "",
    valid: false
  };

  update((n) => {
    const items = [...n.items, newItem];
    const editingIndex = items.length - 1;
    const editingItem = { ...n.items[editingIndex] };
    return { ...n, items, editingIndex, editingItem };
  });
};

const clear = () => set(initialState);

const setItems = (items: IfeedInfo[]) => {
  update((n) => ({ ...n, items }));
};

const startEdit = (editingIndex: number) => {
  update((n) => {
    const editingItem = { ...n.items[editingIndex] };
    console.log(editingItem);
    return { ...n, editingIndex, editingItem };
  });
};

const finishEdit = () => {
  update((n) => {
    // const items = n.items.map((item: IfeedInfo, i: number) => (i === n.editingIndex) ? n.editingItem: item);
    const items = [...n.items];
    items[n.editingIndex] = n.editingItem;
    console.log(items);
    const editingIndex = -1;
    const editingItem = null;
    return { ...n, items, editingIndex, editingItem };
  });
};

const remove = () => {
  update((n) => {
    const items = n.items.filter((_: any, i: number) => i !== n.editingIndex);
    const editingIndex = -1;
    const editingItem = null;
    return { ...n, items, editingIndex, editingItem };
  });
};

const cancelEdit = () => {
  update((n) => {
    const editingIndex = -1;
    const editingItem = null;
    return { ...n, editingIndex, editingItem };
  });
};

export const feedInfos = {
  subscribe,
  set,
  update,
  load,
  save: async (uid: string) => {
    await putFeedInfos(uid, get(feedInfos).items);
  },
  clear,
  add,
  remove,
  setItems,
  startEdit,
  finishEdit,
  cancelEdit
};
