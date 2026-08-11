import { redirect } from "next/navigation";

import { getAuthorizedSession, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { config } from "@/lib/config";

const errorMessages: Record<string, string> = {
  AccessDenied: "Your GitHub account is not authorized to use this application.",
  Configuration: "GitHub OAuth is not configured correctly. Contact the application administrator.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAuthorizedSession()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-primary font-black text-primary-foreground">FI</div>
          <CardTitle className="text-2xl">{config.appName}</CardTitle>
          <CardDescription>Sign in with an authorized GitHub account.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{errorMessages[error] || "GitHub sign-in failed. Please try again."}</AlertDescription></Alert>}
          <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
            <Button type="submit" size="lg" className="w-full">Continue with GitHub</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
