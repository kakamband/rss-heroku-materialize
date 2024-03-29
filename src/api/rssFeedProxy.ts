import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import type { Icontent, Ifeed, IfeedInfo } from "../common/Feed";

type Tmethod = "GET" | "PUT" | "DELTE" | "POST";

const api = async (
  path: string,
  query: string = null,
  method: Tmethod = "GET",
  data: object = null
) => {
  const resourceRow = query
    ? `${window.location.origin}/${path}?${query}`
    : `${window.location.origin}/${path}`;
  const resource = encodeURI(resourceRow);

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };
  if (data) init.body = JSON.stringify(data);

  const response = await fetch(resource, init);
  return response;
};

export const getFeed = async (rssUrl: string): Promise<Ifeed> => {
  const response: Response = await api("rss-feed", `url=${rssUrl}`, "GET");

  const feed: Ifeed = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: "",

    title: "",
    description: "",
    link: "",
    contents: []
  };

  const urlParse = new URL(response.url);
  feed.url = urlParse.searchParams.get("url");

  if (!response.ok) return feed;
  const result = await response.json();

  feed.title = result.title;
  feed.description = result.description;
  feed.link = result.link;

  const contents: Icontent[] = result.contents.map((content: Icontent) => ({
    ...content,
    date: dayjs(content.isoDate)
  }));
  feed.contents = contents;

  return feed;
};

export const getFeeds = async (feedInfos: IfeedInfo[]): Promise<Ifeed[]> => {
  const promises = feedInfos.map((feedInfo) => getFeed(feedInfo.url));
  const feeds = await Promise.all(promises);
  return feeds;
};

export const putFeedInfos = async (id: string, feedInfos: IfeedInfo[]) => {
  const response: Response = await api("feed-infos", `id=${id}`, "PUT", {
    feedInfos
  });
  console.log(response.ok, response.status, response.statusText);
};

export const getFeedInfos = async (id: string): Promise<IfeedInfo[]> => {
  const response: Response = await api("feed-infos", `id=${id}`, "GET");
  if (!response.ok)
    throw new Error(
      `API error: ${response.url} ${response.status} ${response.statusText}`
    );
  const feedInfos: IfeedInfo[] = await response.json();

  // ！！！暫定処理！！！
  // idをUUIDにする
  return feedInfos.map((feedInfo) => ({ ...feedInfo, id: uuidv4() }));

  // return feedInfos;
};
