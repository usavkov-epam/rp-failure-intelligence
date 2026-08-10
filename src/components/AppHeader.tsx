"use client";

import NextLink from "next/link";
import { signOut } from "next-auth/react";
import { AppBar, Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import PlayCircleOutlineRounded from "@mui/icons-material/PlayCircleOutlineRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";

export default function AppHeader({ currentPage, userName, sourceStatus }: {
  currentPage: "analysis" | "runs" | "settings";
  userName: string;
  sourceStatus?: "live" | "error";
}) {
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Container maxWidth={false} sx={{ py: 1.25, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Box sx={{ width: 28, height: 28, bgcolor: "secondary.main", display: "grid", placeItems: "center", color: "white", fontWeight: 900 }}>RP</Box>
          <Typography sx={{ fontWeight: 800 }}>Failure intelligence</Typography>
          <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
            <Button component={NextLink} href="/" size="small" variant={currentPage === "analysis" ? "contained" : "text"} startIcon={<AssessmentOutlined />}>Analysis</Button>
            <Button component={NextLink} href="/runs" size="small" variant={currentPage === "runs" ? "contained" : "text"} startIcon={<PlayCircleOutlineRounded />}>Runs</Button>
            <Button component={NextLink} href="/settings" size="small" variant={currentPage === "settings" ? "contained" : "text"} startIcon={<SettingsRounded />}>Settings</Button>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          {sourceStatus && <Chip size="small" color={sourceStatus === "live" ? "success" : "error"} label={sourceStatus === "live" ? "Live data" : "Load error"} />}
          <Button size="small" startIcon={<RefreshRounded />} onClick={() => location.reload()}>Refresh</Button>
          <Button size="small" onClick={() => signOut({ redirectTo: "/signin" })}>{userName} · Sign out</Button>
        </Stack>
      </Container>
    </AppBar>
  );
}
