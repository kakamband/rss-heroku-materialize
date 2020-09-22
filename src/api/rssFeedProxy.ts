export const getFeeds = async (rssUrl: string) => {
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  
  const query = `url=${rssUrl}`;
  const inputRow = `${url}?${query}`;
  console.log(inputRow);
  const input = encodeURI(inputRow);

  let response = null;
  let error = null;
  let feeds = null;

  try {
    response = await fetch(input);
    if (response.ok) feeds = await response.json();    
  } catch (e) {
    error = e;
  }
  // console.log(feeds);

  return { response, error, feeds };
};
