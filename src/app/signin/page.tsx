import { Box, Button, Paper, Stack, Typography } from "@mui/material";

import { signIn } from "@/auth";
import { config } from "@/lib/config";

const errorMessages: Record<string, string> = {
  AccessDenied: "Your GitHub account is not authorized to use this application.",
  Configuration: "GitHub OAuth is not configured correctly. Contact the application administrator.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#f3f1eb", p: 2 }}>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 440, p: { xs: 3, sm: 5 } }}>
        <Stack spacing={2.5}>
          <Box sx={{ width: 40, height: 40, bgcolor: "#b44a35", display: "grid", placeItems: "center", color: "white", fontWeight: 900 }}>FI</Box>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{config.appName}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Sign in with an authorized GitHub account.</Typography>
          </Box>
          {error && <Typography color="error">{errorMessages[error] || "GitHub sign-in failed. Please try again."}</Typography>}
          <form action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}>
            <Button type="submit" variant="contained" fullWidth sx={{ bgcolor: "#175b52" }}>Continue with GitHub</Button>
          </form>
        </Stack>
      </Paper>
    </Box>
  );
}