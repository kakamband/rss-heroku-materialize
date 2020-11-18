import firebase from "firebase/app";
import { auth } from "firebaseui";

export interface Iuser {
  id: string;
  name: string;
  email: string;
}

export type TauthStateChangeCallback = (user: Iuser) => void;

const firebaseConfig = {
  apiKey: "AIzaSyCKxOAhXymGjUrtiodvue3xL7WA16qd9cc",
  authDomain: "rss-feed-proxy.firebaseapp.com",
  projectId: "rss-feed-proxy",
  appId: "1:1090474250814:web:6a5631b43bc8b5e13d376f"
};

const uiConfig = {
  signInSuccessUrl: `${window.location.origin}/`,
  signInOptions: [firebase.auth.EmailAuthProvider.PROVIDER_ID],
  tosUrl: "",
  privacyPolicyUrl: ""
};

let authUi = null;
let user: Iuser = null;
let authStateChangeCallback: TauthStateChangeCallback = null;
let authContainerId: string = null;

const onAuthStateChanged = (authUser: {
  uid: string;
  displayName: string;
  email: string;
}) => {
  if (authUser) {
    // console.log(authUser);
    if (!user || authUser.uid !== user.id) {
      user = {
        id: authUser.uid,
        name: authUser.displayName,
        email: authUser.email
      };
      if (!user.name) user.name = authUser.email;
      authStateChangeCallback(user);
    }
  } else {
    if (user) {
      user = null;
      authStateChangeCallback(user);
    }
  }
};

export const init = (callback: TauthStateChangeCallback, id: string) => {
  authStateChangeCallback = callback;
  authContainerId = id;

  firebase.initializeApp(firebaseConfig);
  firebase.auth().onAuthStateChanged(onAuthStateChanged, (e) => {
    throw e;
  });
  authUi = new auth.AuthUI(firebase.auth());
};

export const signIn = () => {
  authUi.start(`#${authContainerId}`, uiConfig);
};

export const signOut = () => {
  firebase.auth().signOut();
};
