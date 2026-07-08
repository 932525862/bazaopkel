import { StartClient } from "@tanstack/react-start/client";
import { hydrateRoot } from "react-dom/client";
import { getRouter } from "./router";

const router = getRouter();
//@ts-ignore
hydrateRoot(document, <StartClient router={router} />);
