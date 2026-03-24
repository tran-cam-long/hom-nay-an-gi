import { useContext } from "react";
import { MultiplayerContext } from "./MultiplayerContext";


export function useMultiplayer() {
    const value = useContext(MultiplayerContext);

    if (!value) {
        throw new Error(
            "useMultiplayer must be used inside MultiplayerConnectionProvider"
        );
    }

    return value;
}

export default useMultiplayer;