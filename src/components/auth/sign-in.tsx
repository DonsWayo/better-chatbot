"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useObjectState } from "@/hooks/use-object-state";
import Link from "next/link";
import { useState } from "react";

import { SocialAuthenticationProvider } from "app-types/authentication";
import { authClient } from "auth/client";
import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { safe } from "ts-safe";
import { GithubIcon } from "ui/github-icon";
import { GoogleIcon } from "ui/google-icon";
import { MicrosoftIcon } from "ui/microsoft-icon";

export default function SignIn({
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
  isFirstUser,
}: {
  emailAndPasswordEnabled: boolean;
  signUpEnabled: boolean;
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
}) {
  const t = useTranslations("Auth.SignIn");

  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const hasSocial = socialAuthenticationProviders.length > 0;

  const [formData, setFormData] = useObjectState({
    email: "",
    password: "",
  });

  const emailAndPasswordSignIn = () => {
    setLoading(true);
    safe(() =>
      authClient.signIn.email(
        {
          email: formData.email,
          password: formData.password,
          callbackURL: "/",
        },
        {
          onError(ctx) {
            toast.error(ctx.error.message || ctx.error.statusText);
          },
        },
      ),
    )
      .watch(() => setLoading(false))
      .unwrap();
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    authClient.signIn.social({ provider }).catch((e) => {
      toast.error(e.error);
    });
  };
  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 justify-center">
      <Card className="w-full md:max-w-md bg-background border-none mx-auto shadow-none animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardHeader className="my-4">
          <CardTitle className="font-display text-2xl text-center my-1 tracking-tight">
            {t("title")}
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {/*
            asafe-ai: Microsoft (Entra) SSO is the DEFAULT sign-in. Email/password is a
            secondary path for the seeded super-admin, hidden behind "Administrator sign-in".
            When no SSO provider is configured (e.g. local dev), the email form shows directly
            so the admin can always log in.
          */}
          {hasSocial && !showAdmin && (
            <div className="flex flex-col gap-2 w-full">
              {socialAuthenticationProviders.includes("microsoft") && (
                <Button
                  onClick={() => handleSocialSignIn("microsoft")}
                  className="w-full"
                  data-testid="signin-microsoft-button"
                >
                  <MicrosoftIcon className="size-4" />
                  {t("continueWithMicrosoft")}
                </Button>
              )}
              {socialAuthenticationProviders.includes("google") && (
                <Button
                  variant="outline"
                  onClick={() => handleSocialSignIn("google")}
                  className="flex-1 w-full"
                >
                  <GoogleIcon className="size-4 fill-foreground" />
                  Google
                </Button>
              )}
              {socialAuthenticationProviders.includes("github") && (
                <Button
                  variant="outline"
                  onClick={() => handleSocialSignIn("github")}
                  className="flex-1 w-full"
                >
                  <GithubIcon className="size-4 fill-foreground" />
                  GitHub
                </Button>
              )}
            </div>
          )}
          {emailAndPasswordEnabled && (showAdmin || !hasSocial) && (
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  autoFocus
                  disabled={loading}
                  value={formData.email}
                  onChange={(e) => setFormData({ email: e.target.value })}
                  type="email"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  disabled={loading}
                  value={formData.password}
                  placeholder="********"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      emailAndPasswordSignIn();
                    }
                  }}
                  onChange={(e) => setFormData({ password: e.target.value })}
                  type="password"
                  required
                />
              </div>
              <Button
                className="w-full"
                onClick={emailAndPasswordSignIn}
                disabled={loading}
                data-testid="signin-submit-button"
              >
                {loading ? (
                  <Loader className="size-4 animate-spin ml-1" />
                ) : (
                  t("signIn")
                )}
              </Button>
            </div>
          )}
          {emailAndPasswordEnabled && hasSocial && !isFirstUser && (
            <div className="mt-6 text-center text-sm">
              <button
                type="button"
                onClick={() => setShowAdmin((v) => !v)}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                data-testid="admin-signin-toggle"
              >
                {showAdmin
                  ? t("backToMicrosoftSignIn")
                  : t("administratorSignIn")}
              </button>
            </div>
          )}
          {signUpEnabled && (
            <div className="my-8 text-center text-sm text-muted-foreground">
              {t("noAccount")}
              <Link href="/sign-up" className="underline-offset-4 text-primary">
                {t("signUp")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
