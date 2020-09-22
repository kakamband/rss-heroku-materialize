export const getFeeds = async (rssUrl: string) => {
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  
  const query = `url=${rssUrl}`;
  const inputRow = `${url}?${query}`;
  console.log(inputRow);

  const input = encodeURI(inputRow);

  const response = await fetch(input);
  const feeds = await response.json();
  console.log(feeds);

  return feeds;
};
