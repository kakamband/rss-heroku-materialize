<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import * as firebase from "firebase/app";
  import * as firebaseui from 'firebaseui';
  import type { Iuser } from "../common/Auth.ts";

  export let user: Iuser = null;
  let authLabel = "サインイン";
  let authUi = null;
  const dispatch = createEventDispatcher();

  const firebaseConfig = {
    apiKey: "AIzaSyCKxOAhXymGjUrtiodvue3xL7WA16qd9cc",
    authDomain: "rss-feed-proxy.firebaseapp.com",
    projectId: "rss-feed-proxy",
    appId: "1:1090474250814:web:6a5631b43bc8b5e13d376f"
  };

  const uiConfig = {
    signInSuccessUrl: `${location.origin}/`,
    signInOptions: [
      firebase.auth.EmailAuthProvider.PROVIDER_ID,
    ],
    tosUrl: "",
    privacyPolicyUrl: "",
  };

  const onAuthStateChanged = (authUser) => {
    if (authUser) {
      console.log(authUser)
      if (!user || authUser.uid !== user.id) {
        user = { id: authUser.uid, name: authUser.displayName, email: authUser.email };
        if (!user.name) user.name = authUser.email;
        authLabel = user.name;
        dispatch("exec", { payload: "login" });
      }
    } else {
      if (user) {
        user = null;
        authLabel = "サインイン";
        dispatch("exec", { payload: "logout" });
        authUi.start("#firebaseui-auth-container", uiConfig);
      }
    }
  };

  onMount(async () => {
    firebase.initializeApp(firebaseConfig);
    firebase.auth().onAuthStateChanged(onAuthStateChanged, (e) => {
      console.log(e);
    });
    authUi = new firebaseui.auth.AuthUI(firebase.auth());
  });

  const onClick = () => {
    if (user) {
      if (confirm("サインアウトしますか？")) firebase.auth().signOut();
    } else {
      authUi.start("#firebaseui-auth-container", uiConfig);
    }
  };
</script>

<div id="firebaseui-auth-container"></div>
<a href={"#"} on:click={onClick}>{authLabel}</a>
