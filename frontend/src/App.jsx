import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  // =========================================================
  // AUTH
  // =========================================================

  const [user, setUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [registerMode, setRegisterMode] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState("customer");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // =========================================================
  // CUSTOMER
  // =========================================================

  const [tickets, setTickets] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [aiResponses, setAiResponses] = useState({});
  const [generatingAI, setGeneratingAI] = useState({});

  // =========================================================
  // AGENT
  // =========================================================

  const [agentTickets, setAgentTickets] = useState([]);

  const [editingTicket, setEditingTicket] = useState(null);
  const [editedResponse, setEditedResponse] = useState("");

  // =========================================================
  // ADMIN
  // =========================================================

  const [allTickets, setAllTickets] = useState([]);

  const [assignTicketId, setAssignTicketId] = useState("");
  const [agentId, setAgentId] = useState("");

  // =========================================================
  // AUTH HELPERS
  // =========================================================

  const getToken = () => {
    return localStorage.getItem("supportai_token");
  };

  const getHeaders = () => {
    const token = getToken();

    return {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
  };

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  const loadCurrentUser = async () => {
    const token = getToken();

    if (!token) {
      return false;
    }

    try {
      let response;

      try {
        response = await axios.get(
          `${API}/auth/me`,
          getHeaders()
        );
      } catch (error) {
        response = await axios.get(
          `${API}/users/me`,
          getHeaders()
        );
      }

      setUser(response.data);
      setLoggedIn(true);

      return true;
    } catch (error) {
      console.error("Could not load current user:", error);

      localStorage.removeItem("supportai_token");

      setUser(null);
      setLoggedIn(false);

      return false;
    }
  };

  // =========================================================
  // LOGIN
  // =========================================================

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await axios.post(
        `${API}/auth/login`,
        {
          email,
          password,
        }
      );

      const token = response.data.access_token;

      localStorage.setItem(
        "supportai_token",
        token
      );

      setEmail("");
      setPassword("");

      const success = await loadCurrentUser();

      if (success) {
        setMessage("Login successful!");
      } else {
        setMessage(
          "Login successful, but user details could not be loaded."
        );
      }
    } catch (error) {
      console.error("Login error:", error);

      setMessage(
        error.response?.data?.detail ||
          "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // REGISTER
  // =========================================================

  const handleRegister = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      await axios.post(
        `${API}/auth/register`,
        {
          name: registerName,
          email: registerEmail,
          password: registerPassword,
          role: registerRole,
        }
      );

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterRole("customer");

      setRegisterMode(false);

      setMessage(
        "Registration successful! Please login."
      );
    } catch (error) {
      console.error("Registration error:", error);

      setMessage(
        error.response?.data?.detail ||
          "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // LOGOUT
  // =========================================================

  const logout = () => {
    localStorage.removeItem("supportai_token");

    setUser(null);
    setLoggedIn(false);

    setTickets([]);
    setAgentTickets([]);
    setAllTickets([]);

    setAiResponses({});

    setMessage("");
  };

  // =========================================================
  // CUSTOMER - LOAD TICKETS
  // =========================================================

  const loadCustomerTickets = async () => {
    try {
      const response = await axios.get(
        `${API}/tickets/my`,
        getHeaders()
      );

      const loadedTickets = response.data || [];

      setTickets(loadedTickets);

      // Load already saved AI responses.
      //
      // IMPORTANT:
      // We merge them instead of replacing the existing
      // frontend state.
      const savedResponses = {};

      loadedTickets.forEach((ticket) => {
        if (ticket.ai_response) {
          savedResponses[ticket.id] =
            ticket.ai_response;
        }
      });

      setAiResponses((previous) => ({
        ...previous,
        ...savedResponses,
      }));

      return loadedTickets;
    } catch (error) {
      console.error(
        "Error loading customer tickets:",
        error
      );

      if (error.response?.status === 401) {
        logout();
      }

      return [];
    }
  };

  // =========================================================
  // CUSTOMER - GENERATE AI RESPONSE
  //
  // This function is intentionally used internally after
  // creating a ticket.
  //
  // Customer does NOT get a regenerate button.
  // =========================================================

  const generateAIResponseAutomatically = async (
    ticketId
  ) => {
    setGeneratingAI((previous) => ({
      ...previous,
      [ticketId]: true,
    }));

    try {
      const response = await axios.post(
        `${API}/tickets/${ticketId}/ai-response`,
        {},
        getHeaders()
      );

      const data = response.data;

      const generatedResponse =
        data.draft_response ||
        data.final_response ||
        data.ai_response ||
        data.response ||
        "";

      if (generatedResponse) {
        // Save immediately in React state.
        setAiResponses((previous) => ({
          ...previous,
          [ticketId]: generatedResponse,
        }));

        // Also update the ticket locally.
        setTickets((previousTickets) =>
          previousTickets.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  ai_response:
                    generatedResponse,
                  ai_status:
                    data.status || "DRAFT",
                  ai_response_id:
                    data.response_id || null,
                }
              : ticket
          )
        );
      }
    } catch (error) {
      console.error(
        "AI response generation error:",
        error
      );

      setMessage(
        error.response?.data?.detail ||
          "AI response generation failed."
      );
    } finally {
      setGeneratingAI((previous) => ({
        ...previous,
        [ticketId]: false,
      }));

      // Confirm the saved result from backend.
      await loadCustomerTickets();
    }
  };

  // =========================================================
  // CUSTOMER - CREATE TICKET
  //
  // IMPORTANT:
  // Customer only submits title + description.
  //
  // Priority is NOT submitted.
  // ML model determines priority from the ticket text.
  // =========================================================

  const createTicket = async (e) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setMessage(
        "Please enter both title and description."
      );

      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await axios.post(
        `${API}/tickets/`,
        {
          title: title.trim(),
          description: description.trim(),
        },
        getHeaders()
      );

      const createdTicket = response.data;

      // Clear form.
      setTitle("");
      setDescription("");

      // Add newly created ticket immediately.
      setTickets((previous) => [
        createdTicket,
        ...previous,
      ]);

      // If backend already contains an AI response,
      // save it immediately.
      if (createdTicket.ai_response) {
        setAiResponses((previous) => ({
          ...previous,
          [createdTicket.id]:
            createdTicket.ai_response,
        }));
      }

      setMessage(
        "Ticket created. AI is analyzing your issue..."
      );

      // Automatically generate AI response.
      await generateAIResponseAutomatically(
        createdTicket.id
      );

      setMessage(
        "Ticket analyzed and AI response generated successfully."
      );
    } catch (error) {
      console.error(
        "Ticket creation error:",
        error
      );

      setMessage(
        error.response?.data?.detail ||
          "Could not create ticket."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // COPY AI RESPONSE
  // =========================================================

  const copyAIResponse = async (response) => {
    try {
      await navigator.clipboard.writeText(response);

      setMessage(
        "AI response copied to clipboard."
      );
    } catch (error) {
      console.error("Copy error:", error);

      setMessage(
        "Could not copy AI response."
      );
    }
  };

  // =========================================================
  // AGENT - LOAD DASHBOARD
  // =========================================================

  const loadAgentDashboard = async () => {
    try {
      const response = await axios.get(
        `${API}/tickets/agent/dashboard`,
        getHeaders()
      );

      setAgentTickets(
        response.data?.tickets || []
      );
    } catch (error) {
      console.error(
        "Error loading agent dashboard:",
        error
      );
    }
  };

  // =========================================================
  // AGENT - REVIEW AI RESPONSE
  // =========================================================

  const reviewAIResponse = async (
    ticketId,
    reviewStatus
  ) => {
    try {
      const payload = {
        status: reviewStatus,
      };

      if (reviewStatus === "EDITED") {
        if (!editedResponse.trim()) {
          setMessage(
            "Please enter the edited response."
          );

          return;
        }

        payload.final_response =
          editedResponse.trim();
      }

      if (
        reviewStatus === "ESCALATED" &&
        editedResponse.trim()
      ) {
        payload.final_response =
          editedResponse.trim();
      }

      await axios.put(
        `${API}/tickets/${ticketId}/ai-review`,
        payload,
        getHeaders()
      );

      setEditingTicket(null);
      setEditedResponse("");

      setMessage(
        `AI response ${reviewStatus.toLowerCase()} successfully.`
      );

      await loadAgentDashboard();
    } catch (error) {
      console.error(
        "AI review error:",
        error
      );

      setMessage(
        error.response?.data?.detail ||
          "Could not review AI response."
      );
    }
  };

  // =========================================================
  // ADMIN - LOAD ALL TICKETS
  // =========================================================

  const loadAllTickets = async () => {
    try {
      const response = await axios.get(
        `${API}/tickets/admin/all`,
        getHeaders()
      );

      setAllTickets(response.data || []);
    } catch (error) {
      console.error(
        "Error loading admin tickets:",
        error
      );
    }
  };

  // =========================================================
  // ADMIN - ASSIGN TICKET
  // =========================================================

  const assignTicket = async () => {
    if (!assignTicketId || !agentId) {
      setMessage(
        "Please enter both Ticket ID and Agent ID."
      );

      return;
    }

    try {
      await axios.put(
        `${API}/tickets/${assignTicketId}`,
        {
          assigned_agent_id: Number(agentId),
        },
        getHeaders()
      );

      setMessage(
        `Ticket ${assignTicketId} assigned successfully.`
      );

      setAssignTicketId("");
      setAgentId("");

      await loadAllTickets();
    } catch (error) {
      console.error(
        "Ticket assignment error:",
        error
      );

      setMessage(
        error.response?.data?.detail ||
          "Could not assign ticket."
      );
    }
  };

  // =========================================================
  // INITIAL AUTH CHECK
  // =========================================================

  useEffect(() => {
    const initialize = async () => {
      const token = getToken();

      if (!token) {
        return;
      }

      await loadCurrentUser();
    };

    initialize();
  }, []);

  // =========================================================
  // LOAD ROLE-SPECIFIC DATA
  // =========================================================

  useEffect(() => {
    if (!loggedIn || !user) {
      return;
    }

    if (user.role === "customer") {
      loadCustomerTickets();
    }

    if (user.role === "agent") {
      loadAgentDashboard();
    }

    if (user.role === "admin") {
      loadAllTickets();
    }
  }, [loggedIn, user]);

  // =========================================================
  // LOGIN / REGISTER PAGE
  // =========================================================

  if (!loggedIn) {
    return (
      <div className="app auth-app">
        <style>{`
          .auth-app {
            min-height: 100vh;
            overflow: hidden;
            position: relative;
            background:
              radial-gradient(circle at 15% 25%, rgba(117, 76, 145, .16), transparent 28%),
              radial-gradient(circle at 84% 70%, rgba(225, 171, 93, .10), transparent 28%),
              linear-gradient(135deg, #06070b 0%, #0b0a10 48%, #120d16 100%);
            color: #f4efe7;
            font-family: "DM Sans", "Segoe UI", sans-serif;
          }

          .auth-app * { box-sizing: border-box; }

          .auth-app::before,
          .auth-app::after {
            content: "";
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            filter: blur(5px);
            animation: authFloat 12s ease-in-out infinite;
          }

          .auth-app::before {
            width: 430px;
            height: 430px;
            left: -240px;
            top: 12%;
            background: radial-gradient(circle, rgba(126, 82, 157, .15), transparent 70%);
          }

          .auth-app::after {
            width: 500px;
            height: 500px;
            right: -270px;
            bottom: -220px;
            background: radial-gradient(circle, rgba(225, 171, 93, .09), transparent 70%);
            animation-delay: -5s;
          }

          @keyframes authFloat {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(18px, -15px, 0); }
          }

          .auth-container {
            min-height: 100vh;
            width: 100%;
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 42px 28px;
          }

          .auth-layout {
            width: min(1120px, 100%);
            display: grid;
            grid-template-columns: minmax(330px, 1fr) minmax(380px, 455px);
            align-items: center;
            gap: clamp(45px, 7vw, 95px);
          }

          .auth-visual {
            min-height: 540px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            animation: authLeft .8s cubic-bezier(.2,.8,.2,1) both;
          }

          @keyframes authLeft {
            from { opacity: 0; transform: translateX(-24px); }
            to { opacity: 1; transform: translateX(0); }
          }

          .auth-brand {
            position: absolute;
            top: 30px;
            left: 34px;
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .auth-brand-icon {
            width: 43px;
            height: 43px;
            display: grid;
            place-items: center;
            border-radius: 13px;
            background: linear-gradient(145deg, rgba(170, 124, 201, .28), rgba(71, 49, 84, .30));
            border: 1px solid rgba(255,255,255,.10);
            box-shadow: inset 1px 1px 0 rgba(255,255,255,.08), 0 12px 28px rgba(0,0,0,.28);
            font-size: 20px;
          }

          .auth-brand strong {
            display: block;
            font-family: "Manrope", "Segoe UI", sans-serif;
            font-size: 19px;
            letter-spacing: -.5px;
          }

          .auth-brand small {
            display: block;
            margin-top: 3px;
            color: #817984;
            font-size: 8px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }

          .lamp-stage {
            position: relative;
            width: 390px;
            height: 430px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .lamp-halo {
            position: absolute;
            width: 360px;
            height: 360px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(232,189,123,.10), rgba(137,91,163,.035) 42%, transparent 70%);
            opacity: .55;
            transition: all .8s ease;
          }

          .lamp-glow {
            position: absolute;
            width: 310px;
            height: 245px;
            top: 70px;
            background: radial-gradient(ellipse, rgba(255,224,166,.42), rgba(232,180,96,.13) 40%, transparent 72%);
            clip-path: polygon(35% 0, 65% 0, 100% 100%, 0 100%);
            filter: blur(12px);
            opacity: 0;
            transform: scale(.92);
            transition: opacity .8s ease, transform .8s ease;
          }

          .lamp {
            position: relative;
            width: 245px;
            height: 345px;
            z-index: 2;
            display: flex;
            align-items: center;
            flex-direction: column;
            filter: drop-shadow(0 22px 25px rgba(0,0,0,.36));
            animation: lampFloat 5.5s ease-in-out infinite;
          }

          @keyframes lampFloat {
            0%,100% { transform: translateY(0); }
            50% { transform: translateY(-7px); }
          }

          .lamp-shade {
            position: relative;
            width: 220px;
            height: 143px;
            background: linear-gradient(110deg, #29272e, #151419 48%, #2d2932);
            clip-path: polygon(18% 0, 82% 0, 100% 100%, 0 100%);
            border-radius: 12px 12px 35px 35px;
            box-shadow: inset 18px 0 28px rgba(255,255,255,.015), inset -22px 0 35px rgba(0,0,0,.42), 0 18px 35px rgba(0,0,0,.38);
            transition: all .8s ease;
          }

          .lamp-face {
            position: absolute;
            left: 50%;
            top: 61%;
            transform: translate(-50%, -50%);
            display: flex;
            justify-content: center;
            gap: 48px;
            width: 100%;
            opacity: .32;
            transition: opacity .4s ease;
          }

          .lamp-eye {
            width: 11px;
            height: 7px;
            border-bottom: 2px solid #111015;
            border-radius: 0 0 100% 100%;
            transition: all .4s ease;
          }

          .lamp-mouth {
            position: absolute;
            width: 19px;
            height: 9px;
            left: 50%;
            top: 24px;
            transform: translateX(-50%);
            border-bottom: 2px solid #111015;
            border-radius: 0 0 100% 100%;
            opacity: 0;
            transition: opacity .4s ease;
          }

          .lamp-chain {
            position: absolute;
            top: 135px;
            left: 50%;
            width: 2px;
            height: 58px;
            background: linear-gradient(#b3b3ba,#55555d);
            transform: translateX(35px);
            z-index: 5;
          }

          .lamp-chain span {
            position: absolute;
            left: -4px;
            bottom: -7px;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, #dadade, #64646b);
          }

          .lamp-stem {
            width: 21px;
            height: 145px;
            margin-top: -3px;
            background: linear-gradient(90deg, #48484f, #a0a0a8 44%, #37373e);
            border-radius: 3px;
            box-shadow: inset 3px 0 rgba(255,255,255,.12), 5px 0 15px rgba(0,0,0,.25);
            transition: box-shadow .7s ease;
          }

          .lamp-base {
            width: 105px;
            height: 25px;
            border-radius: 50% 50% 40% 40%;
            background: linear-gradient(180deg, #9d9da5, #53535c);
            box-shadow: 0 8px 20px rgba(0,0,0,.45);
          }

          .lamp-shadow {
            position: absolute;
            bottom: 48px;
            width: 225px;
            height: 22px;
            border-radius: 50%;
            background: #000;
            opacity: .42;
            filter: blur(11px);
            transition: all .7s ease;
          }

          .lamp-caption {
            position: absolute;
            bottom: 2px;
            color: #68616d;
            font-size: 9px;
            letter-spacing: 3px;
            text-transform: uppercase;
            transition: color .4s ease;
          }

          .auth-card {
            position: relative;
            width: 100%;
            padding: 34px;
            border-radius: 28px;
            background: linear-gradient(145deg, rgba(39,33,49,.72), rgba(14,13,20,.84));
            border: 1px solid rgba(255,255,255,.10);
            box-shadow: 0 35px 85px rgba(0,0,0,.48), inset 1px 1px 0 rgba(255,255,255,.07), inset -1px -1px 0 rgba(0,0,0,.35);
            backdrop-filter: blur(28px) saturate(125%);
            -webkit-backdrop-filter: blur(28px) saturate(125%);
            overflow: hidden;
            animation: authRight .8s .08s cubic-bezier(.2,.8,.2,1) both;
          }

          @keyframes authRight {
            from { opacity: 0; transform: translateX(24px); }
            to { opacity: 1; transform: translateX(0); }
          }

          .auth-card::before {
            content: "";
            position: absolute;
            width: 250px;
            height: 130px;
            top: -75px;
            left: -70px;
            background: linear-gradient(135deg, rgba(255,255,255,.13), transparent 65%);
            transform: rotate(-12deg);
            pointer-events: none;
          }

          .auth-status {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #756d79;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 1.8px;
            text-transform: uppercase;
            margin-bottom: 25px;
          }

          .auth-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #8faf96;
            box-shadow: 0 0 11px rgba(143,175,150,.45);
          }

          .auth-card h2 {
            margin: 0;
            color: #f6f0e8;
            font-family: "Manrope", "Segoe UI", sans-serif;
            font-size: 29px;
            font-weight: 750;
            letter-spacing: -1px;
          }

          .auth-subtitle {
            margin: 9px 0 26px;
            color: #918895;
            font-size: 12px;
            line-height: 1.6;
          }

          .auth-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .auth-field-label {
            margin-top: 3px;
            color: #a8a0ad;
            font-size: 10px;
            font-weight: 600;
          }

          .auth-input-wrap {
            height: 53px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 14px;
            border-radius: 13px;
            background: rgba(5,6,10,.42);
            border: 1px solid rgba(255,255,255,.075);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.025), inset 0 -5px 14px rgba(0,0,0,.10);
            transition: all .25s ease;
          }

          .auth-input-wrap:focus-within {
            border-color: rgba(232,189,123,.44);
            background: rgba(27,23,31,.74);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 0 0 3px rgba(232,189,123,.045), 0 10px 25px rgba(0,0,0,.16);
            transform: translateY(-1px);
          }

          .auth-input-icon {
            width: 18px;
            color: #716977;
            font-size: 13px;
            text-align: center;
            transition: color .25s ease;
          }

          .auth-input-wrap:focus-within .auth-input-icon { color: #e8bd7b; }

          .auth-input-wrap input {
            width: 100%;
            height: 100%;
            min-width: 0;
            border: 0 !important;
            outline: 0 !important;
            background: transparent !important;
            color: #f0ebe3 !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 13px;
            box-shadow: none !important;
          }

          .auth-input-wrap input::placeholder { color: #625c66; }

          .auth-select {
            width: 100%;
            height: 53px;
            padding: 0 14px;
            border-radius: 13px;
            border: 1px solid rgba(255,255,255,.075);
            outline: none;
            background: rgba(5,6,10,.42);
            color: #eee9e1;
            cursor: pointer;
            transition: all .25s ease;
          }

          .auth-select:focus {
            border-color: rgba(232,189,123,.44);
            box-shadow: 0 0 0 3px rgba(232,189,123,.045);
          }

          .auth-select option { background: #17131c; color: #f4efe7; }

          .auth-submit {
            position: relative;
            width: 100%;
            height: 53px;
            margin-top: 7px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            overflow: hidden;
            border: 0;
            border-radius: 13px;
            cursor: pointer;
            color: #1b140d;
            background: linear-gradient(135deg, #f0c986, #e0a664 55%, #cd8c4b);
            box-shadow: 0 13px 30px rgba(207,143,78,.18), inset 0 1px 0 rgba(255,255,255,.38), inset 0 -2px 0 rgba(107,64,29,.15);
            font-size: 13px;
            font-weight: 800;
            transition: all .25s cubic-bezier(.2,.8,.2,1);
          }

          .auth-submit::before {
            content: "";
            position: absolute;
            top: 0;
            left: -120%;
            width: 75%;
            height: 100%;
            background: linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent);
            transform: skewX(-18deg);
            transition: left .7s ease;
          }

          .auth-submit:hover::before { left: 140%; }
          .auth-submit:hover { transform: translateY(-2px); filter: brightness(1.05); box-shadow: 0 18px 35px rgba(207,143,78,.25), inset 0 1px 0 rgba(255,255,255,.40); }
          .auth-submit:active { transform: translateY(0); }
          .auth-submit:disabled { opacity: .65; cursor: wait; transform: none; }

          .auth-divider {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 23px 0 18px;
          }

          .auth-divider span { flex: 1; height: 1px; background: rgba(255,255,255,.06); }
          .auth-divider small { color: #5e5863; font-size: 7px; letter-spacing: 1.8px; }

          .switch-auth {
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 5px;
            color: #77707b;
            font-size: 11px;
          }

          .switch-auth button {
            padding: 0;
            border: 0;
            background: transparent;
            color: #e8bd7b;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
            transition: color .2s ease;
          }

          .switch-auth button:hover { color: #f4d39c; }

          .message {
            margin-top: 16px;
            padding: 11px 13px;
            border-radius: 11px;
            background: rgba(141,98,180,.08);
            border: 1px solid rgba(141,98,180,.18);
            color: #d2c0dc;
            font-size: 11px;
            line-height: 1.5;
            text-align: center;
          }

          .auth-secure {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
            margin-top: 20px;
            color: #57515b;
            font-size: 7px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }

          .auth-secure span { color: #8faf96; }

          .auth-layout:focus-within .lamp-shade {
            background: linear-gradient(110deg, #cfc8ba, #f4e8d0 48%, #cec3b1);
            box-shadow: inset -18px 0 25px rgba(0,0,0,.12), 0 16px 38px rgba(232,189,123,.22);
          }

          .auth-layout:focus-within .lamp-glow { opacity: 1; transform: scale(1.08); }
          .auth-layout:focus-within .lamp-halo { opacity: 1; transform: scale(1.10); }
          .auth-layout:focus-within .lamp-face { opacity: 1; }
          .auth-layout:focus-within .lamp-mouth { opacity: 1; }
          .auth-layout:focus-within .lamp-eye { height: 9px; }
          .auth-layout:focus-within .lamp-caption { color: #a98a68; }
          .auth-layout:focus-within .lamp-stem { box-shadow: inset 3px 0 rgba(255,255,255,.14), 0 0 22px rgba(232,189,123,.16); }

          @media (max-width: 900px) {
            .auth-layout { grid-template-columns: 1fr; max-width: 500px; gap: 5px; }
            .auth-visual { min-height: 260px; transform: scale(.72); transform-origin: center bottom; margin-bottom: -70px; }
            .auth-brand { position: relative; top: auto; left: auto; margin-bottom: 15px; }
          }

          @media (max-width: 560px) {
            .auth-container { padding: 22px 14px; }
            .auth-card { padding: 25px 19px; border-radius: 22px; }
            .auth-card h2 { font-size: 26px; }
            .auth-brand { justify-content: center; }
            .auth-visual { display: none; }
          }

          @media (prefers-reduced-motion: reduce) {
            .auth-app *, .auth-app::before, .auth-app::after { animation: none !important; transition: none !important; }
          }
        `}</style>

        <div className="auth-brand">
          <div className="auth-brand-icon">🤖</div>
          <div>
            <strong>SupportAI</strong>
            <small>Intelligent customer support</small>
          </div>
        </div>

        <div className="auth-container">
          <div className="auth-layout">
            <div className="auth-visual" aria-hidden="true">
              <div className="lamp-stage">
                <div className="lamp-halo" />
                <div className="lamp-glow" />

                <div className="lamp">
                  <div className="lamp-shade">
                    <div className="lamp-face">
                      <span className="lamp-eye" />
                      <span className="lamp-eye" />
                      <span className="lamp-mouth" />
                    </div>
                  </div>

                  <div className="lamp-chain">
                    <span />
                  </div>

                  <div className="lamp-stem" />
                  <div className="lamp-base" />
                </div>

                <div className="lamp-shadow" />
                <div className="lamp-caption">quietly keeping things moving</div>
              </div>
            </div>

            <div className="auth-card">
              <div className="auth-status">
                <span className="auth-status-dot" />
                Secure SupportAI Access
              </div>

              {!registerMode ? (
                <>
                  <h2>Welcome back.</h2>
                  <p className="auth-subtitle">
                    Sign in to manage your support tickets and let SupportAI handle the routine work.
                  </p>

                  <form className="auth-form" onSubmit={handleLogin}>
                    <label className="auth-field-label">EMAIL ADDRESS</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">✉</span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <label className="auth-field-label">PASSWORD</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">●</span>
                      <input
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                      />
                    </div>

                    <button className="auth-submit" type="submit" disabled={loading}>
                      {loading ? "Signing in..." : "Sign in"}
                      {!loading && <span>→</span>}
                    </button>
                  </form>

                  <div className="auth-divider">
                    <span />
                    <small>SUPPORTAI</small>
                    <span />
                  </div>

                  <p className="switch-auth">
                    Don't have an account?
                    <button
                      type="button"
                      onClick={() => {
                        setRegisterMode(true);
                        setMessage("");
                      }}
                    >
                      Create one
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <h2>Create your account.</h2>
                  <p className="auth-subtitle">
                    Set up your SupportAI workspace and start managing customer support intelligently.
                  </p>

                  <form className="auth-form" onSubmit={handleRegister}>
                    <label className="auth-field-label">FULL NAME</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">♙</span>
                      <input
                        type="text"
                        placeholder="Your name"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </div>

                    <label className="auth-field-label">EMAIL ADDRESS</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">✉</span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <label className="auth-field-label">PASSWORD</label>
                    <div className="auth-input-wrap">
                      <span className="auth-input-icon">●</span>
                      <input
                        type="password"
                        placeholder="At least 8 characters"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        minLength={8}
                        required
                        autoComplete="new-password"
                      />
                    </div>

                    <label className="auth-field-label">ACCOUNT TYPE</label>
                    <select
                      className="auth-select"
                      value={registerRole}
                      onChange={(e) => setRegisterRole(e.target.value)}
                    >
                      <option value="customer">Customer</option>
                      <option value="agent">Agent</option>
                    </select>

                    <button className="auth-submit" type="submit" disabled={loading}>
                      {loading ? "Creating..." : "Create account"}
                      {!loading && <span>→</span>}
                    </button>
                  </form>

                  <div className="auth-divider">
                    <span />
                    <small>ALREADY REGISTERED?</small>
                    <span />
                  </div>

                  <p className="switch-auth">
                    Already have an account?
                    <button
                      type="button"
                      onClick={() => {
                        setRegisterMode(false);
                        setMessage("");
                      }}
                    >
                      Sign in
                    </button>
                  </p>
                </>
              )}

              {message && <div className="message">{message}</div>}

              <div className="auth-secure">
                <span>●</span>
                Secure JWT authentication
                <span>•</span>
                Protected access
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // CUSTOMER DASHBOARD
  // =========================================================

  if (user?.role === "customer") {
    return (
      <div className="app">

        {/* NAVBAR */}

        <header className="navbar">

          <div>
            <h1>
              🤖 SupportAI
            </h1>

            <span>
              Customer Dashboard
            </span>
          </div>

          <div className="user-section">

            <span>
              👤 {user.name}
            </span>

            <button onClick={logout}>
              Logout
            </button>

          </div>

        </header>

        <main className="dashboard">

          {/* WELCOME */}

          <section className="welcome-section">

            <h2>
              Welcome, {user.name} 👋
            </h2>

            <p>
              Describe your problem and SupportAI
              will automatically analyze and
              prioritize your ticket.
            </p>

          </section>

          {message && (
            <div className="message">
              {message}
            </div>
          )}

          {/* CREATE TICKET */}

          <section className="card create-ticket">

            <h2>
              🎫 Create Support Ticket
            </h2>

            <form onSubmit={createTicket}>

              <input
                type="text"
                placeholder="Ticket title"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                required
              />

              <textarea
                placeholder="Describe your problem..."
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                rows="5"
                required
              />

              <button
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Analyzing..."
                  : "Create Ticket"}
              </button>

            </form>

          </section>

          {/* MY TICKETS */}

          <section className="card">

            <div className="section-header">

              <h2>
                📋 My Tickets
              </h2>

              <button
                onClick={loadCustomerTickets}
              >
                🔄 Refresh
              </button>

            </div>

            {tickets.length === 0 ? (
              <p className="empty-state">
                No tickets found.
              </p>
            ) : (
              <div className="ticket-list">

                {tickets.map((ticket) => {

                  const response =
                    aiResponses[ticket.id] ||
                    ticket.ai_response ||
                    "";

                  const isGenerating =
                    generatingAI[ticket.id];

                  return (
                    <div
                      className="ticket-card"
                      key={ticket.id}
                    >

                      {/* TICKET HEADER */}

                      <div className="ticket-header">

                        <div>

                          <h3>
                            #{ticket.id}{" "}
                            {ticket.title}
                          </h3>

                          <p>
                            {ticket.description}
                          </p>

                        </div>

                        <span
                          className={`status ${(
                            ticket.status || ""
                          ).toLowerCase()}`}
                        >
                          {ticket.status}
                        </span>

                      </div>

                      {/* AI ANALYSIS */}

                      <div className="ticket-info">

                        <span>
                          Priority:{" "}
                          <strong>
                            {ticket.priority ||
                              "Analyzing..."}
                          </strong>
                        </span>

                        <span>
                          Category:{" "}
                          <strong>
                            {ticket.category ||
                              "Analyzing..."}
                          </strong>
                        </span>

                        <span>
                          Sentiment:{" "}
                          <strong>
                            {ticket.sentiment ||
                              "Analyzing..."}
                          </strong>
                        </span>

                        <span>
                          Intent:{" "}
                          <strong>
                            {ticket.intent ||
                              "Analyzing..."}
                          </strong>
                        </span>

                      </div>

                      {/* AI RESPONSE */}

                      <div className="ai-box">

                        <div className="ai-box-header">

                          <h4>
                            🤖 AI Support Response
                          </h4>

                          {ticket.ai_status && (
                            <span>
                              {ticket.ai_status}
                            </span>
                          )}

                        </div>

                        {response ? (
                          <>
                            <p>
                              {response}
                            </p>

                            {/* CUSTOMER ONLY GETS COPY.
                                NO REGENERATE BUTTON. */}

                            <div className="ai-actions">

                              <button
                                onClick={() =>
                                  copyAIResponse(
                                    response
                                  )
                                }
                              >
                                📋 Copy
                              </button>

                            </div>
                          </>
                        ) : isGenerating ? (
                          <div className="ai-loading">
                            🤖 SupportAI is analyzing
                            your ticket and generating
                            a response...
                          </div>
                        ) : (
                          <div className="ai-loading">
                            AI response is not available
                            yet.
                          </div>
                        )}

                      </div>

                    </div>
                  );
                })}

              </div>
            )}

          </section>

        </main>

      </div>
    );
  }

  // =========================================================
  // AGENT DASHBOARD
  // =========================================================

  if (user?.role === "agent") {
    return (
      <div className="app">

        <header className="navbar">

          <div>
            <h1>
              🤖 SupportAI
            </h1>

            <span>
              Agent Dashboard
            </span>
          </div>

          <div className="user-section">

            <span>
              👤 {user.name}
            </span>

            <button onClick={logout}>
              Logout
            </button>

          </div>

        </header>

        <main className="dashboard">

          <section className="welcome-section">

            <h2>
              Agent Dashboard 👨‍💻
            </h2>

            <p>
              Review AI-generated responses,
              edit them when necessary, or
              escalate tickets.
            </p>

          </section>

          {message && (
            <div className="message">
              {message}
            </div>
          )}

          <section className="card">

            <div className="section-header">

              <h2>
                🎫 Assigned Tickets
              </h2>

              <button
                onClick={loadAgentDashboard}
              >
                🔄 Refresh
              </button>

            </div>

            {agentTickets.length === 0 ? (
              <p className="empty-state">
                No tickets assigned to you.
              </p>
            ) : (
              <div className="ticket-list">

                {agentTickets.map((ticket) => (

                  <div
                    className="ticket-card"
                    key={ticket.ticket_id}
                  >

                    <div className="ticket-header">

                      <div>

                        <h3>
                          #{ticket.ticket_id}{" "}
                          {ticket.title}
                        </h3>

                        <p>
                          {ticket.description}
                        </p>

                      </div>

                      <span
                        className={`status ${(
                          ticket.status || ""
                        ).toLowerCase()}`}
                      >
                        {ticket.status}
                      </span>

                    </div>

                    <div className="ticket-info">

                      <span>
                        Priority:{" "}
                        <strong>
                          {ticket.priority}
                        </strong>
                      </span>

                      <span>
                        Category:{" "}
                        <strong>
                          {ticket.category ||
                            "N/A"}
                        </strong>
                      </span>

                    </div>

                    {/* AI DRAFT */}

                    <div className="ai-box">

                      <div className="ai-box-header">

                        <h4>
                          🤖 AI Draft
                        </h4>

                        <span>
                          {ticket.ai_status ||
                            "NO RESPONSE"}
                        </span>

                      </div>

                      {ticket.ai_draft ? (
                        <p>
                          {ticket.ai_draft}
                        </p>
                      ) : (
                        <p>
                          No AI response generated
                          yet.
                        </p>
                      )}

                    </div>

                    {/* HUMAN REVIEW */}

                    {ticket.ai_draft &&
                      ticket.ai_status ===
                        "DRAFT" && (

                        <div className="review-section">

                          {editingTicket ===
                          ticket.ticket_id ? (
                            <>
                              <textarea
                                value={
                                  editedResponse
                                }
                                onChange={(e) =>
                                  setEditedResponse(
                                    e.target.value
                                  )
                                }
                                rows="6"
                              />

                              <div className="button-row">

                                <button
                                  onClick={() =>
                                    reviewAIResponse(
                                      ticket.ticket_id,
                                      "EDITED"
                                    )
                                  }
                                >
                                  ✅ Save Edited
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingTicket(
                                      null
                                    );

                                    setEditedResponse(
                                      ""
                                    );
                                  }}
                                >
                                  Cancel
                                </button>

                              </div>
                            </>
                          ) : (
                            <div className="button-row">

                              <button
                                onClick={() =>
                                  reviewAIResponse(
                                    ticket.ticket_id,
                                    "APPROVED"
                                  )
                                }
                              >
                                ✅ Approve
                              </button>

                              <button
                                onClick={() => {
                                  setEditingTicket(
                                    ticket.ticket_id
                                  );

                                  setEditedResponse(
                                    ticket.ai_draft
                                  );
                                }}
                              >
                                ✏️ Edit
                              </button>

                              <button
                                onClick={() =>
                                  reviewAIResponse(
                                    ticket.ticket_id,
                                    "ESCALATED"
                                  )
                                }
                              >
                                ⚠️ Escalate
                              </button>

                            </div>
                          )}

                        </div>
                      )}

                    {ticket.ai_status &&
                      ticket.ai_status !== "DRAFT" && (
                        <div className="reviewed-status">
                          AI response status:{" "}
                          <strong>
                            {ticket.ai_status}
                          </strong>
                        </div>
                      )}

                  </div>

                ))}

              </div>
            )}

          </section>

        </main>

      </div>
    );
  }

  // =========================================================
  // ADMIN DASHBOARD
  // =========================================================

  if (user?.role === "admin") {
    return (
      <div className="app">

        <header className="navbar">

          <div>

            <h1>
              🤖 SupportAI
            </h1>

            <span>
              Admin Dashboard
            </span>

          </div>

          <div className="user-section">

            <span>
              👤 {user.name}
            </span>

            <button onClick={logout}>
              Logout
            </button>

          </div>

        </header>

        <main className="dashboard">

          <section className="welcome-section">

            <h2>
              Admin Dashboard ⚙️
            </h2>

            <p>
              Manage tickets and assign them
              to support agents.
            </p>

          </section>

          {message && (
            <div className="message">
              {message}
            </div>
          )}

          {/* ASSIGN TICKET */}

          <section className="card">

            <h2>
              👨‍💻 Assign Ticket to Agent
            </h2>

            <div className="form-row">

              <input
                type="number"
                placeholder="Ticket ID"
                value={assignTicketId}
                onChange={(e) =>
                  setAssignTicketId(
                    e.target.value
                  )
                }
              />

              <input
                type="number"
                placeholder="Agent ID"
                value={agentId}
                onChange={(e) =>
                  setAgentId(e.target.value)
                }
              />

              <button
                onClick={assignTicket}
              >
                Assign Ticket
              </button>

            </div>

          </section>

          {/* ALL TICKETS */}

          <section className="card">

            <div className="section-header">

              <h2>
                📋 All Tickets
              </h2>

              <button
                onClick={loadAllTickets}
              >
                🔄 Refresh
              </button>

            </div>

            {allTickets.length === 0 ? (
              <p className="empty-state">
                No tickets found.
              </p>
            ) : (
              <div className="ticket-list">

                {allTickets.map((ticket) => (

                  <div
                    className="ticket-card"
                    key={ticket.id}
                  >

                    <div className="ticket-header">

                      <div>

                        <h3>
                          #{ticket.id}{" "}
                          {ticket.title}
                        </h3>

                        <p>
                          {ticket.description}
                        </p>

                      </div>

                      <span
                        className={`status ${(
                          ticket.status || ""
                        ).toLowerCase()}`}
                      >
                        {ticket.status}
                      </span>

                    </div>

                    <div className="ticket-info">

                      <span>
                        Customer ID:{" "}
                        <strong>
                          {ticket.customer_id}
                        </strong>
                      </span>

                      <span>
                        Agent ID:{" "}
                        <strong>
                          {ticket.assigned_agent_id ||
                            "Unassigned"}
                        </strong>
                      </span>

                      <span>
                        Priority:{" "}
                        <strong>
                          {ticket.priority}
                        </strong>
                      </span>

                      <span>
                        Category:{" "}
                        <strong>
                          {ticket.category ||
                            "N/A"}
                        </strong>
                      </span>

                      <span>
                        Sentiment:{" "}
                        <strong>
                          {ticket.sentiment ||
                            "N/A"}
                        </strong>
                      </span>

                      <span>
                        Intent:{" "}
                        <strong>
                          {ticket.intent ||
                            "N/A"}
                        </strong>
                      </span>

                    </div>

                    {ticket.ai_response && (
                      <div className="ai-box">

                        <div className="ai-box-header">

                          <h4>
                            🤖 AI Response
                          </h4>

                          <span>
                            {ticket.ai_status}
                          </span>

                        </div>

                        <p>
                          {ticket.ai_response}
                        </p>

                      </div>
                    )}

                  </div>

                ))}

              </div>
            )}

          </section>

        </main>

      </div>
    );
  }

  // =========================================================
  // FALLBACK
  // =========================================================

  return (
    <div className="app">

      <div className="auth-container">

        <div className="auth-card">

          <h2>
            Unknown user role
          </h2>

          <button onClick={logout}>
            Logout
          </button>

        </div>

      </div>

    </div>
  );
}

export default App;