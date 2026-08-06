import { createTheme } from "@mui/material";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#175b52" },
    secondary: { main: "#b44a35" },
    background: { default: "#f3f1eb", paper: "#fffefb" },
    text: { primary: "#17211f", secondary: "#5e6b67" },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    h1: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: 0 },
    h2: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});