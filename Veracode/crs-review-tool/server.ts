import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { dryRunJson } from "./src/mockData.js";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.disable('etag');

  const useMocks = process.env.NODE_ENV !== 'production' && process.env.VITE_ENVIRONMENT !== 'production';

  // Prompts Config Routes
  let devMemPrompts = { sast: "", sca: "" };

  // Config info Route
  app.get("/api/config/info", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (useMocks) {
      return res.json({
        engines: ["Gemini"],
        scanValidityDays: 90,
        noSca: [],
        history: ["MockProfile1", "MockShopApp", "MockAdminPortal"]
      });
    }

    try {
      const response = await fetch('http://127.0.0.1:8081/api/config/info');
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching config info:', error);
      res.status(500).json({ error: 'Failed to fetch config info from reporting service.' });
    }
  });

  app.get("/api/config/history", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (useMocks) {
      return res.json(["MockProfile1", "MockShopApp", "MockAdminPortal"]);
    }

    try {
      const response = await fetch('http://127.0.0.1:8081/api/config/history');
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching history info:', error);
      res.status(500).json({ error: 'Failed to fetch history info from reporting service.' });
    }
  });

  app.get("/api/config/prompts", async (req, res) => {
    if (useMocks) {
       try {
         res.json({ sastPrompt: devMemPrompts.sast, scaPrompt: devMemPrompts.sca });
       } catch (error) {
         console.error('Error reading local prompts:', error);
         res.status(500).json({ error: 'Failed to read local prompts' });
       }
       return;
    }

    try {
      const response = await fetch('http://127.0.0.1:8081/api/config/prompts');
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching prompts:', error);
      res.status(500).json({ error: 'Failed to fetch prompts from reporting service.' });
    }
  });

  app.post("/api/config/prompts", async (req, res) => {
    if (useMocks) {
      try {
        const { sastPrompt, scaPrompt } = req.body;
        devMemPrompts = { sast: sastPrompt, sca: scaPrompt };
        res.json({ success: true });
      } catch (error) {
        console.error('Error writing local prompts:', error);
        res.status(500).json({ error: 'Failed to save local prompts' });
      }
      return;
    }

    try {
      const { sastPrompt, scaPrompt } = req.body;
      const response = await fetch('http://127.0.0.1:8081/api/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sastPrompt, scaPrompt })
      });
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error saving prompts:', error);
      res.status(500).json({ error: 'Failed to save prompts to reporting service.' });
    }
  });

  app.get("/api/prompts", async (req, res) => {
    try {
      res.json(devMemPrompts);
    } catch (error) {
      console.error('Error reading prompts:', error);
      res.status(500).json({ error: 'Failed to read prompts' });
    }
  });

  app.post("/api/prompts", async (req, res) => {
    try {
      const { sast, sca } = req.body;
      devMemPrompts = { sast, sca };
      res.json({ success: true });
    } catch (error) {
      console.error('Error writing prompts:', error);
      res.status(500).json({ error: 'Failed to save prompts' });
    }
  });

  // AI API Route
  app.post("/api/ai", async (req, res) => {
    const { comment, provider } = req.body;

    if (!comment) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const prompt = comment; // The prompt is now fully built on the frontend

    try {
      if (provider === 'azure') {
        const apiKey = process.env.VITE_AZURE_OPENAI_KEY;
        const endpoint = process.env.VITE_AZURE_OPENAI_ENDPOINT;
        const deployment = process.env.VITE_AZURE_OPENAI_DEPLOYMENT;

        if (!apiKey || !endpoint || !deployment) {
          throw new Error('Azure OpenAI configuration missing (Key, Endpoint, or Deployment)');
        }

        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2023-05-15`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a security audit expert.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 500,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(`Azure Error: ${err.error?.message || response.statusText}`);
        }

        const data = await response.json();
        res.json({ text: data.choices[0].message.content });
      } else {
        const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const response = await geminiClient.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
        });
        res.json({ text: response.text || 'AI could not generate a response.' });
      }
    } catch (error) {
      console.error('Error fetching AI response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/getfinalreport", async (req, res) => {
    if (useMocks) {
      return res.json(dryRunJson);
    }
    
    const appProfile = req.query['application-name'] as string;
    if (!appProfile) {
      return res.status(400).json({ error: "application-name is required" });
    }

    try {
      const response = await fetch(`http://127.0.0.1:8081/getfinalreport?application-name=${encodeURIComponent(appProfile)}`);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { 
            status: "error",
            type: "SYSTEM_ERROR",
            error: `Endpoint at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}` 
          };
        }
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching final report:', error);
      res.status(500).json({ 
        status: "error",
        type: "SYSTEM_ERROR",
        message: 'Failed to fetch final report from reporting service.' 
      });
    }
  });

  app.post("/api/veracode/mitigation", async (req, res) => {
    if (useMocks) {
      return res.json({ message: "Mock mitigation successful." });
    }

    try {
      const response = await fetch(`http://127.0.0.1:8081/api/veracode/mitigation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body)
      });
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { 
            status: "error",
            type: "SYSTEM_ERROR",
            error: `Endpoint at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}` 
          };
        }
        return res.status(response.status).json(errorData);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        data = { success: true };
      }
      res.json(data);
    } catch (error) {
      console.error('Error in /api/veracode/mitigation:', error);
      res.status(500).json({ 
        status: "error",
        type: "SYSTEM_ERROR",
        message: 'Failed to apply mitigation via reporting service.' 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
