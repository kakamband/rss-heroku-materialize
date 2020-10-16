// import { Authpack } from "@authpack/sdk";

export interface Iuser {
  id: string;
  name: string;
  email: string;
}

// class Auth {
//   private authpack;
//   private unlisten;

//   constructor() {
//     this.authpack = new Authpack({
// 		  key: "wga-client-key-687e9f9d7e762835aad651f8f",
//     });

// 		this.unlisten = this.authpack.listen((state) => {
//       console.log(state);
      
// 			if (!state.ready) {
// 				console.log("Loading...");
// 			} else {
//         if (state.bearer) {
//           localStorage.setItem('bearer', state.bearer);
//         }
          
// 				if (state.user) {
// 					console.log(state.user);
//           if (!user || state.user.id !== user.id) {
//             authLabel = "ログアウト";
//             user = { id: state.user.id, name: state.user.name, email: state.user.email, };
//             dispatch("exec", { payload: "login" });
//           }
// 				} else {
// 					console.log("User not logged in.");
//           if (user) {
//             authLabel = "ログイン";
//             user = null;
//             dispatch("exec", { payload: "logout" });
//           }
//         }
// 			}
// 		});
//   }
// }