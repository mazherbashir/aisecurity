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
         // Return full config if we have it, otherwise just the prompts
         res.json({
           "SAST&SCA Prompts" : {
             "sastPrompt" : "I’m providing information on a First Party Finding for an application in JSON format.\n\nDefinitions:\n- cwe id: The CWE ID of the finding\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Determine if this is a real security issue.\n2. Determine if the mitigation sufficiently reduces the risk.\n3. If not mitigated, clearly state why.\n\nInstructions (STRICT):\n- Start with: \"Proposal Approved\" or \"Proposal Rejected\"\n- Provide ONLY ONE short paragraph\n- Maximum 4–5 sentences\n- Maximum 120 words\n- No repetition, no extra explanation\n- Keep reasoning concise and direct\n- Follow Zero-Trust principles in evaluation but don't repeat it in para.\n\nDo not provide bullet points, headings, or long explanations.",
             "scaPrompt" : "I’m providing information on a Third Party (SCA) Finding in JSON format.\n\nDefinitions:\n- name: Vulnerable component name\n- cve id: CVE identifier\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Identify if a non-vulnerable version exists\n2. Identify if mitigation without upgrade is possible\n3. Assess if the finding could be a false positive\n4. Enforce strict security governance (Zero-Trust)\n\nSTRICT GOVERNANCE RULES:\n- If the vulnerability is still reported by the SCA tool → DO NOT accept false positive claim\n- If the source of the dependency is unclear → REJECT and require investigation\n- Always require validation with Veracode (or tool owner) before closure\n- Never approve based solely on assumption\n\nOUTPUT INSTRUCTIONS (STRICT):\n- Start with ONLY ONE of:\n  \"Proposal Approved\" OR \"Proposal Rejected\" OR \"Check Manually\"\n- Provide ONE paragraph only\n- Maximum 6 sentences\n- Maximum 150 words\n- Keep reasoning concise and direct\n- Do NOT explain CWE background\n- Avoid repetition and filler text\n\nCVE HANDLING:\n- If you are confident about the CVE → include a short reference link:"
           },
           "System" : {
             "scanValidityDays" : 90,
             "mitigationProposalEnabled" : true,
             "mitigationApiType" : "REST",
             "saveXmlLogs" : true,
             "saveJsonHistory" : true,
             "historyLimit" : 10,
             "secondaryAuditEnabled" : false,
             "safeSCAVERSION" : {
               "scaSafeVersionEnabled" : true,
               "scaStaleFixMessage" : "No safe version found. Fix applies to a different major version. Check manually.",
               "scaNoFixMessage" : "No safe version published in GHSA. Check manually.",
               "saveScaLog" : false
             }
           },
           "AiEngine" : {
             "aiEngines" : [ "Gemini" ],
             "engineModels" : [ "azure.gpt-4o" ],
             "sharedServiceEndpoint" : "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
             "sharedServiceRole" : "user",
             "sharedServiceMaxTokens" : 1000
           },
           "SecondaryAudit" : {
             "auditorModel" : "gpt-4o-mini",
             "sharedAuditorEndpoint" : "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
             "sharedAuditorMaxTokens" : 1000,
             "sharedAuditorRole" : "user",
             "auditorPrompt" : "You are a Senior Security QA Auditor acting as a secondary verification layer. Your job is to strictly review the output generated by a primary evaluation model against the original input data.\n\nYou will be provided with two sets of data:\n1. [Original Request Data]: The raw vulnerability JSON payload.\n2. [Phase 1 Output]: The text response generated by the primary model.\n\nYour task is to independently verify the quality, accuracy, and constraint compliance of the Phase 1 Output.\n\n### CRITERIA FOR EVALUATION\n1. Accuracy Check: Did Phase 1 correctly interpret the vulnerability description and user comments? (e.g., If the user comments proved the value is a non-secret UI lookup GUID, did Phase 1 correctly identify it as a false positive?)\n2. Constraint Compliance Check: Did Phase 1 strictly adhere to its formatting boundaries?\n   - Does it start exactly with \"Proposal Approved\" or \"Proposal Rejected\"?\n   - Is it written as exactly ONE paragraph?\n   - Is it under 120 words and free of bullet points or headings?\n\n### OUTPUT FORMAT\nYou must output your audit evaluation strictly using the following Markdown template. Do not add conversational intro text or metadata.\n\n### Second Look Assessment\n- **Validation Verdict:** [Agree / Disagree with Phase 1 Verdict]\n- **Rule Compliance:** [Pass / Fail - state if formatting limits were met]\n- **Critique:** [2-3 sentences explaining your reasoning regarding the technical accuracy and compliance of Phase 1]",
             "fallbackText" : "Proposal Rejected please perform a Manual Review as The Evaluator and Auditor model has contradiction!"
           },
           "Exclusions" : {
             "ignoredModules" : [ "Microsoft", "Azure", "System", "AspNetCore", "Newtonsoft", "EntityFramework", "NLog", "Log4Net", "AutoMapper", "AppInsights", "UnitTesting", "BouncyCastle", "Serilog", "Dapper", "OpenXml", "Serialization", "OpenXmlPowerTools", "GemBox", "SharpDocx", "Quartz", "sni.dll", "VeracodeJavaAPI.jar", ".test.dll", ".Tests.dll", ".map", "_nodemodule_", "fsmonitor-watchman.sample" ],
             "includedModules" : [ "veracodegen.htmla.pya", "pwc.", ".zip", ".war", "snapshot.jar", "0.jar", "pwc", "release.jar", "app_", ".bca", ".gz", "-service.jar", "-advancer.jar" ],
             "ignoredEcosystems" : [ "so" ],
             "noScaArchitectures" : [ "Apex", "TSQL" ]
           },
           "Compliance" : {
             "tierMappings" : {
               "External" : {
                 "Confidential" : "tier-1",
                 "HighlyConfidential" : "tier-1",
                 "Internal" : "tier-2",
                 "Public" : "tier-2"
               },
               "Internal" : {
                 "Confidential" : "tier-3b",
                 "HighlyConfidential" : "tier-3a",
                 "Internal" : "tier-3b",
                 "Public" : "tier-3b"
               }
             },
             "gracePeriods" : {
               "tier-4" : { "VeryHigh" : 60, "High" : 60, "Medium" : 90, "Low" : 180 },
               "tier-3b" : { "VeryHigh" : 60, "High" : 60, "Medium" : 90, "Low" : 180 },
               "tier-3a" : { "VeryHigh" : 30, "High" : 30, "Medium" : 60, "Low" : 180 },
               "tier-2" : { "VeryHigh" : 10, "High" : 10, "Medium" : 30, "Low" : 180 },
               "tier-1" : { "VeryHigh" : 10, "High" : 10, "Medium" : 30, "Low" : 180 }
             },
             "tierDropDown" : [ "tier-1", "tier-2", "tier-3a", "tier-3b", "tier-4" ]
           }
         });
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
        // Save the entire config to mock memory if needed, 
        // but for now we follow the "entire JSON object" policy
        const config = req.body;
        // If we still need to preserve prompts specifically for other routes:
        if (config["SAST&SCA Prompts"]) {
          devMemPrompts = { 
            sast: config["SAST&SCA Prompts"].sastPrompt || "", 
            sca: config["SAST&SCA Prompts"].scaPrompt || "" 
          };
        }
        res.json({ success: true });
      } catch (error) {
        console.error('Error writing local configuration:', error);
        res.status(500).json({ error: 'Failed to save local configuration' });
      }
      return;
    }

    try {
      const response = await fetch('http://127.0.0.1:8081/api/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error saving configuration:', error);
      res.status(500).json({ error: 'Failed to save configuration to reporting service.' });
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
    if (!useMocks) {
      try {
        const response = await fetch(`http://127.0.0.1:8081/api/ai/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        });
        
        if (!response.ok) {
           const errData = await response.text();
           throw new Error(`Backend AI Error: ${errData}`);
        }
        
        const data = await response.json();
        return res.json(data);
      } catch (error) {
        console.error('Error proxying AI response:', error);
        return res.status(500).json({ status: "error", error: String(error) });
      }
    }

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
        res.json({
          status: 'success',
          result: data.choices[0].message.content,
          engine: 'azure',
          in: 120,
          out: 45
        });
      } else {
        const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const response = await geminiClient.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt,
        });
        res.json({
          status: 'success',
          result: response.text || 'AI could not generate a response.',
          engine: 'gemini',
          in: 142,
          out: 56
        });
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
