// / and /join — join form on phones without a room code in the URL.
import { navigate } from "../router";
import { PhoneJoin } from "./PhoneJoin";

export function PhoneJoinRoute() {
  return (
    <PhoneJoin
      onJoin={(code, name) => {
        try {
          sessionStorage.setItem("opg:name", name);
        } catch {
          /* ignore */
        }
        navigate(`/${code}`);
      }}
    />
  );
}
