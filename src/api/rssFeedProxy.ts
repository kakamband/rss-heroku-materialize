const getFeeds = async (rssUrl: string = "https://news.yahoo.co.jp/pickup/rss.xml") => {
  const url = "https://ssh.cloud.google.com/devshell/proxy";
  const query = `authuser=0&port=8080&environment_id=default&url=${rssUrl}`;
  const input = `${url}?${query}`;
  console.log(input);

  const encodedInput = encodeURI(input);

  const init = {
    method: "GET",
    mode: 'cors',
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // "Accept": "application/vnd.github.mercy-preview+json",
    },
  };

  const response = await fetch(encodedInput, init);
  const myJson = await response.json();
  console.log(myJson);
};

export { getFeeds };
