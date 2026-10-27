import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        paypalEmail: { type: "string", required: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut } = authClient;
