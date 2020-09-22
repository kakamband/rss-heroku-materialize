const getFeeds = async (rssUrl: string) => {
  const url = "https://8080-cs-994772306133-default.asia-east1.cloudshell.dev/rss-feed/";
  
  const query = `url=${rssUrl}`;
  const input = `${url}?${query}`;
  console.log(input);

  const encodedInput = encodeURI(input);

  // const init: RequestInit = {
  //   method: "GET",
  //   mode: "cors",
  //   credentials: "include",
  //   headers: {
  //     "Content-Type": "application/json; charset=utf-8",
  //     "Accept": "application/vnd.github.mercy-preview+json",
  //   },
  // };

  // const response = await fetch(encodedInput, init);
  const response = await fetch(encodedInput);
  const myJson = await response.json();
  console.log(myJson);
};

export { getFeeds };
