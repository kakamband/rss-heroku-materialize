export const getFeeds = async (rssUrl: string) => {
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  const query = `?url=${rssUrl}`;
  const inputRow = `${url}${query}`;
  const input = encodeURI(inputRow);

  const response = await fetch(input);
  const feeds = (response.ok)? await response.json() : [];

  const urlParse = new URL(response.url);
  const resRssurl = urlParse.searchParams.get("url");

  return { 
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: resRssurl,
    feeds,
  };
};
