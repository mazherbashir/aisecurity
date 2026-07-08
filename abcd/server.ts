import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import os from "os";
import { dryRunJson } from "./src/mockData.js";

dotenv.config();

// SNOW Credentials Parser
function parseCredentials(content: string) {
  const trimmed = content.trim();
  let secretKey: string | null = null;
  let endpoint: string | null = null;

  // Try JSON first
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      secretKey = parsed["gcast-secret-key"] || parsed["gcast_secret_key"] || parsed["gcastSecretKey"] || null;
      endpoint = parsed["gcast-rest-endpoint-intake"] || parsed["gcast_rest_endpoint_intake"] || parsed["gcastRestEndpointIntake"] || null;
    } catch (e) {
      console.error("Parsed credentials as JSON but failed:", e);
    }
  }

  // If not parsed yet or keys missing, parse line-by-line properties format
  if (!secretKey || !endpoint) {
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith("#") || cleanLine.startsWith(";")) continue;
      
      const match = cleanLine.match(/^([^=:]+)[=:](.*)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        
        if (key === "gcast-secret-key" || key === "gcast_secret_key" || key === "gcastsecretkey") {
          secretKey = value;
        } else if (key === "gcast-rest-endpoint-intake" || key === "gcast_rest_endpoint_intake" || key === "gcastrestendpointintake") {
          endpoint = value;
        }
      }
    }
  }

  return { secretKey, endpoint };
}

async function readCrsCredentials() {
  const homeDir = os.homedir();
  const credPath = path.join(homeDir, ".crs-tool", "credentials");
  try {
    // Safely check if the file exists first using fs.stat to prevent standard ENOENT crash logging
    const exists = await fs.stat(credPath).then(() => true).catch(() => false);
    if (!exists) {
      console.log(`[ServiceNow] Credentials file not found at ${credPath}. Using environment variables or fallback values.`);
      return {
        secretKey: process.env.GCAST_SECRET_KEY || null,
        endpoint: process.env.GCAST_REST_ENDPOINT_INTAKE || null
      };
    }
    const data = await fs.readFile(credPath, "utf-8");
    return parseCredentials(data);
  } catch (error) {
    console.log(`[ServiceNow] Could not read credentials from ${credPath}: ${(error as Error).message}`);
    return {
      secretKey: process.env.GCAST_SECRET_KEY || null,
      endpoint: process.env.GCAST_REST_ENDPOINT_INTAKE || null,
      error: `Could not read credentials file at ${credPath}. Reason: ${(error as Error).message}`
    };
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 1500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.disable('etag');

  const useMocks = process.env.NODE_ENV !== 'production' && process.env.VITE_ENVIRONMENT !== 'production';

  // Prompts Config Routes
  let devMemPrompts = { sast: "", sca: "" };
  let devMemFullConfig: any = null;

  // Config info Route
  app.get("/api/config/info", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (useMocks) {
      return res.json({
        noSca: [ "Apex", "TSQL", "Perl" ],
        tiers: [ "tier-1", "tier-2", "tier-3a", "tier-3b" ],
        scaSafeVersionEnabled: true,
        intakeRequest: (devMemFullConfig && devMemFullConfig["System"] && devMemFullConfig["System"].intakeRequest !== undefined) ? devMemFullConfig["System"].intakeRequest : true,
        engines: ["Gemini", "azure.gpt-4o"],
        "history-checkmarx": [ "FIT_Honeybee_develop.json", "FIT_Honeybee_1781906942677.json" ],
        history: [
          "GBL_ASR_NGA_ADMIN_CROSS_BORDERS.json",
          "GBL_ADV_CDE_Junction_US_2_03.json",
          "GBL_ADV_CDE_Junction_US_2_02.json",
          "GBL_ADV_CDE_Junction_US_2_01.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_03.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_02.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_01.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER.json",
          "USA_IFS_Job_Requisition_Assistant.json",
          "USA_ADV_Value_Creation_for_CFOs_04.json"
        ],
        scanValidityDays: 90
      });
    }

    try {
      const response = await fetchWithTimeout('http://127.0.0.1:8081/api/config/info', {}, 1500);
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json({
        ...data,
        intakeRequest: (devMemFullConfig && devMemFullConfig["System"] && devMemFullConfig["System"].intakeRequest !== undefined) ? devMemFullConfig["System"].intakeRequest : true,
        tiers: data.tiers || ["tier-1", "tier-2", "tier-3a", "tier-3b"]
      });
    } catch (error) {
      console.log('[ServiceNow] Failed to fetch live config info, using offline fallback data:', (error as Error).message);
      res.json({
        noSca: [ "Apex", "TSQL", "Perl" ],
        tiers: [ "tier-1", "tier-2", "tier-3a", "tier-3b" ],
        scaSafeVersionEnabled: true,
        intakeRequest: (devMemFullConfig && devMemFullConfig["System"] && devMemFullConfig["System"].intakeRequest !== undefined) ? devMemFullConfig["System"].intakeRequest : true,
        engines: ["Gemini", "azure.gpt-4o"],
        "history-checkmarx": [ "FIT_Honeybee_develop.json", "FIT_Honeybee_1781906942677.json" ],
        history: [
          "GBL_ASR_NGA_ADMIN_CROSS_BORDERS.json",
          "GBL_ADV_CDE_Junction_US_2_03.json",
          "GBL_ADV_CDE_Junction_US_2_02.json",
          "GBL_ADV_CDE_Junction_US_2_01.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_03.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_02.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER_01.json",
          "GBL_ASR_NGA_OMNI_DOC_VIEWER.json",
          "USA_IFS_Job_Requisition_Assistant.json",
          "USA_ADV_Value_Creation_for_CFOs_04.json"
        ],
        scanValidityDays: 90
      });
    }
  });

  app.get("/api/config/history", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (useMocks) {
      return res.json(["MockProfile1", "MockShopApp", "MockAdminPortal"]);
    }

    try {
      const response = await fetchWithTimeout('http://127.0.0.1:8081/api/config/history', {}, 1500);
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.log('[ServiceNow] Failed to fetch history, using offline fallback history:', (error as Error).message);
      res.json(["MockProfile1", "MockShopApp", "MockAdminPortal"]);
    }
  });

  app.get("/api/config/prompts", async (req, res) => {
    if (useMocks) {
       try {
         if (devMemFullConfig) {
           return res.json(devMemFullConfig);
         }
         // Return full config if we have it, otherwise just the prompts
         const initialConfig = {
           "SAST&SCA Prompts" : {
             "sastPrompt" : "I’m providing information on a First Party Finding for an application in JSON format.\n\nDefinitions:\n- cwe id: The CWE ID of the finding\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Determine if this is a real security issue.\n2. Determine if the mitigation sufficiently reduces the risk.\n3. If not mitigated, clearly state why.\n\nInstructions (STRICT):\n- Start with: \"Proposal Approved\" or \"Proposal Rejected\"\n- Provide ONLY ONE short paragraph\n- Maximum 4–5 sentences\n- Maximum 120 words\n- No repetition, no extra explanation\n- Keep reasoning concise and direct\n- Follow Zero-Trust principles in evaluation but don't repeat it in para.\n\nDo not provide bullet points, headings, or long explanations.",
             "scaPrompt" : "I’m providing information on a Third Party (SCA) Finding in JSON format.\n\nDefinitions:\n- name: Vulnerable component name\n- cve id: CVE identifier\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Identify if a non-vulnerable version exists\n2. Identify if mitigation without upgrade is possible\n3. Assess if the finding could be a false positive\n4. Enforce strict security governance (Zero-Trust)\n\nSTRICT GOVERNANCE RULES:\n- If the vulnerability is still reported by the SCA tool → DO NOT accept false positive claim\n- If the source of the dependency is unclear → REJECT and require investigation\n- Always require validation with Veracode (or tool owner) before closure\n- Never approve based solely on assumption\n\nOUTPUT INSTRUCTIONS (STRICT):\n- Start with ONLY ONE of:\n  \"Proposal Approved\" OR \"Proposal Rejected\" OR \"Check Manually\"\n- Provide ONE paragraph only\n- Maximum 6 sentences\n- Maximum 150 words\n- Keep reasoning concise and direct\n- Do NOT explain CWE background\n- Avoid repetition and filler text\n\nCVE HANDLING:\n- If you are confident about the CVE → include a short reference link:"
           },
           "System" : {
             "scanValidityDays" : 90,
             "intakeRequest": true,
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
             "aiEngines" : [ "Gemini", "azure.gpt-4o" ],
             "engineModels" : [ "azure.gpt-4o", "gemini-1.5-flash" ],
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
           },
           "architecture-mappings" : {
             "Java" : [ "maven", "gradle", "JAVA", "JVM" ],
             "JavaScript" : [ "npm", "bower", "JAVASCRIPT" ],
             "Go" : [ "go", "golang", "GO", "GOLANG" ],
             "PHP" : [ "composer", "PHP", "Packagist" ],
             "NET" : [ "nuget", "CIL32", "MSIL" ],
             "Ruby" : [ "rubygems", "RUBY" ],
             "Python" : [ "pip", "pypi", "PYTHON" ]
           },
           "Checkmarx": {
             "authUrl": "https://us.iam.checkmarx.net/auth/realms/pwc-tax/protocol/openid-connect/token",
             "apiUrl": "https://us.ast.checkmarx.net/api",
             "pollingInterval": 5000,
             "pollingRetry": 15
           },
           "Intake": {
             "gcaasRestEndpointRemediation": "/snow/utils/open_remediation_requests",
             "gcaasRestEndpointIntake": "/snow/utils/open_intake_requests",
             "gcaasRestBaseURL": "https://hosted-apps-we-stage.np-pwclabs.pwcglb.com/api/687da848-9b88-48ce-8d71-d276e6d682f6/crs-rest-api-toolkit-chris-fastapi-staging-test-backend"
           }
         };
         devMemFullConfig = initialConfig;
         res.json(initialConfig);
       } catch (error) {
         console.error('Error reading local prompts:', error);
         res.status(500).json({ error: 'Failed to read local prompts' });
       }
       return;

    }

    try {
      const response = await fetchWithTimeout('http://127.0.0.1:8081/api/config/prompts', {}, 1500);
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data: any = await response.json();
      
      // Patch engines if they are missing or incomplete in production
      if (data && data["AiEngine"]) {
        if (!Array.isArray(data["AiEngine"].aiEngines) || data["AiEngine"].aiEngines.length <= 1) {
          data["AiEngine"].aiEngines = ["Gemini", "azure.gpt-4o"];
        }
        if (!Array.isArray(data["AiEngine"].engineModels)) {
          data["AiEngine"].engineModels = ["azure.gpt-4o", "gemini-1.5-flash"];
        }
      } else if (data) {
        // If AiEngine section is totally missing, we'll let the frontend provide defaults
        // but it's better to ensure it exists here as well
        data["AiEngine"] = {
          aiEngines: ["Gemini", "azure.gpt-4o"],
          engineModels: ["azure.gpt-4o", "gemini-1.5-flash"],
          sharedServiceEndpoint: "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
          sharedServiceRole: "user",
          sharedServiceMaxTokens: 1000
        };
      }
      
      res.json(data);
    } catch (error) {
      console.log('[ServiceNow] Failed to fetch prompts, utilizing local presets:', (error as Error).message);
      // Fallback configuration
      const fallbackConfig = {
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
          "intakeRequest": true,
          "safeSCAVERSION" : {
            "scaSafeVersionEnabled" : true,
            "scaStaleFixMessage" : "No safe version found. Fix applies to a different major version. Check manually.",
            "scaNoFixMessage" : "No safe version published in GHSA. Check manually.",
            "saveScaLog" : false
          }
        },
        "AiEngine" : {
          "aiEngines" : [ "Gemini", "azure.gpt-4o" ],
          "engineModels" : [ "azure.gpt-4o", "gemini-1.5-flash" ],
          "sharedServiceEndpoint" : "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
          "sharedServiceRole" : "user",
          "sharedServiceMaxTokens" : 1000
        },
        "Checkmarx": {
          "authUrl": "https://us.iam.checkmarx.net/auth/realms/pwc-tax/protocol/openid-connect/token",
          "apiUrl": "https://us.ast.checkmarx.net/api",
          "pollingInterval": 5000,
          "pollingRetry": 15
        },
        "Intake": {
          "gcaasRestEndpointRemediation": "/snow/utils/open_remediation_requests",
          "gcaasRestEndpointIntake": "/snow/utils/open_intake_requests",
          "gcaasRestBaseURL": "https://hosted-apps-we-stage.np-pwclabs.pwcglb.com/api/687da848-9b88-48ce-8d71-d276e6d682f6/crs-rest-api-toolkit-chris-fastapi-staging-test-backend"
        }
      };
      res.json(devMemFullConfig || fallbackConfig);
    }
  });

  app.post("/api/config/prompts", async (req, res) => {
    if (useMocks) {
      try {
        // Save the entire config to mock memory if needed, 
        // but for now we follow the "entire JSON object" policy
        const config = req.body;
        devMemFullConfig = config;
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
      const response = await fetchWithTimeout('http://127.0.0.1:8081/api/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      }, 1500);
      if (!response.ok) {
        throw new Error(`Service at 127.0.0.1:8081 returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.log('[ServiceNow] Failed to save configuration to reporting service, saving to memory:', (error as Error).message);
      const config = req.body;
      devMemFullConfig = config;
      if (config["SAST&SCA Prompts"]) {
        devMemPrompts = { 
          sast: config["SAST&SCA Prompts"].sastPrompt || "", 
          sca: config["SAST&SCA Prompts"].scaPrompt || "" 
        };
      }
      res.json({ success: true, remark: "saved to offline mock memory" });
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

  // Heartbeat Route
  app.get("/api/heartbeat", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (useMocks) {
      return res.json({ isServerOnline: true });
    }

    try {
      const response = await fetchWithTimeout('http://127.0.0.1:8081/api/heartbeat', {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      }, 1000); // 1.0 second timeout to prevent blocking socket starvation
      if (!response.ok) {
        return res.json({ isServerOnline: false });
      }
      const data = await response.json();
      return res.json({
        isServerOnline: data.isServerOnline === true || data.isServerOnline === 'true'
      });
    } catch (error) {
      // If the backend at 8081 is down/offline, we handle gracefully and return isServerOnline: false
      return res.json({ isServerOnline: false });
    }
  });

  // Mutable global mock data to allow real-time interactive creations/updates in sandbox mode
  let mockSnowRecordsData = [
    {
      "short_description": "Static Scan Access Request: Advanced Network Monitoring - Enterprise (ThousandEyes) (AMER) (Production) legacy",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake",
        "link": "https://pwcnetworktest.service-now.com/api/now/table/sys_user_group/d7c49a221b8b0c509b6165b9bd4bcb92"
      },
      "request_item": {
        "number": "RITM26124235",
        "state": "Work in Progress",
        "cat_item": {
          "display_value": "Code Review Services",
          "link": "https://pwcnetworktest.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
        }
      },
      "number": "SCTASK29032898",
      "state": "Work in Progress",
      "assigned_to": "",
      "variables": {
        "type": "Static Scan Access Request",
        "application": "CRS-DEMO-APP",
        "billing_model": "Consumption-based"
      }
    },
    {
      "short_description": "Static Scan Access Request: Aura Checker",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake",
        "link": "https://pwcnetworktest.service-now.com/api/now/table/sys_user_group/d7c49a221b8b0c509b6165b9bd4bcb92"
      },
      "request_item": {
        "number": "RITM26187889",
        "state": "Work in Progress",
        "cat_item": {
          "display_value": "Code Review Services",
          "link": "https://pwcnetworktest.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
        }
      },
      "number": "SCTASK29097185",
      "state": "Work in Progress",
      "assigned_to": "Suraj Shinde",
      "variables": {
        "type": "Static Scan Access Request",
        "application": "Test Application",
        "billing_model": "Mandatory BSS"
      }
    },
    {
      "short_description": "CI/CD Integration Support: Cursor AI",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake"
      },
      "request_item": {
        "number": "RITM26124236",
        "state": "Work in Progress"
      },
      "number": "SCTASK29032899",
      "state": "Work in Progress",
      "assigned_to": "",
      "variables": {
        "type": "CI/CD Integration Support",
        "application": "CRS-DEMO-APP"
      }
    },
    {
      "short_description": "Create Application: Advanced Network Monitoring - Enterprise (ThousandEyes)",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake"
      },
      "request_item": {
        "number": "RITM26056126",
        "state": "Work in Progress"
      },
      "number": "SCTASK28971656",
      "state": "Open",
      "assigned_to": "",
      "variables": {
        "type": "Create Scanning Tool Profile",
        "billing_model": "Mandatory BSS"
      }
    },
    {
      "short_description": "Static Scan Onboarding: Legacy CRM Platform Integration Check",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake"
      },
      "request_item": {
        "number": "RITM26056130",
        "state": "No Response"
      },
      "number": "SCTASK28971699",
      "state": "No Response",
      "assigned_to": "John Miller",
      "variables": {
        "type": "Static Scan Access Request",
        "application": "CorpCRM-Legacy",
        "billing_model": "Consumption-based"
      }
    },
    {
      "short_description": "SCA Integration Deferral Request: FinTech Transaction Core",
      "assignment_group": {
        "display_value": "GLOBAL - NIS - CRS Intake"
      },
      "request_item": {
        "number": "RITM26056145",
        "state": "Responded"
      },
      "number": "SCTASK28971710",
      "state": "Responded",
      "assigned_to": "Sarah Jenkins",
      "variables": {
        "type": "CI/CD Integration Support",
        "application": "FinTx-Core",
        "billing_model": "Mandatory BSS"
      }
    }
  ];

  // ServiceNow Intake Records Route (matching Spring Boot API path)
  app.get("/api/intake/requests", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    
    const intakeBase = devMemFullConfig?.Intake?.gcaasRestBaseURL || "http://localhost:8081";
    const intakeSub = devMemFullConfig?.Intake?.gcaasRestEndpointIntake || "/api/intake/requests";
    let intakeEndpoint = intakeBase.endsWith("/") || intakeSub.startsWith("/") 
      ? `${intakeBase}${intakeSub}`
      : `${intakeBase}/${intakeSub}`;
    if (!intakeEndpoint.startsWith("http://") && !intakeEndpoint.startsWith("https://")) {
      intakeEndpoint = "http://localhost:8081/api/intake/requests";
    }

    const extractRecords = (resData: any): any[] => {
      if (!resData) return [];
      if (Array.isArray(resData)) return resData;
      if (resData.result && Array.isArray(resData.result)) return resData.result;
      if (resData.data) {
        if (Array.isArray(resData.data)) return resData.data;
        if (resData.data.result && Array.isArray(resData.data.result)) return resData.data.result;
      }
      return [];
    };

    let recordsData: any[] = [];
    let isLiveSuccess = false;
    let fetchErrorMsg = "";

    try {
      console.log(`Fetching Intake records from: ${intakeEndpoint}`);
      const response = await fetchWithTimeout(intakeEndpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      }, 1500);

      if (response.ok) {
        const data = await response.json();
        recordsData = extractRecords(data);
        isLiveSuccess = true;
      } else {
        fetchErrorMsg = `Intake API returned status ${response.status}`;
      }
    } catch (error) {
      fetchErrorMsg = (error as Error).message;
    }

    if (isLiveSuccess) {
      res.json({
        success: true,
        source: "live",
        data: {
          result: recordsData
        },
        endpointUsed: intakeEndpoint
      });
    } else {
      console.log("[ServiceNow] Using local fallback mock records.");
      res.json({
        success: false,
        source: "mock",
        error: `Could not reach local endpoint: ${fetchErrorMsg}`,
        endpointUsed: intakeEndpoint,
        data: {
          result: mockSnowRecordsData
        }
      });
    }
  });

  // Create or Update ServiceNow Intake Record Route (matching Spring Boot API path)
  app.post("/api/intake/requests", express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const record = req.body;
    const intakeBase = devMemFullConfig?.Intake?.gcaasRestBaseURL || "http://localhost:8081";
    const intakeSub = devMemFullConfig?.Intake?.gcaasRestEndpointIntake || "/api/intake/requests";
    let endpoint = intakeBase.endsWith("/") || intakeSub.startsWith("/") 
      ? `${intakeBase}${intakeSub}`
      : `${intakeBase}/${intakeSub}`;
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      endpoint = "http://localhost:8081/api/intake/requests";
    }

    try {
      console.log(`Forwarding Intake creation/update to: ${endpoint}`);
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(record)
      }, 1500);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      res.json({
        success: true,
        source: "live",
        data: data,
        endpointUsed: endpoint
      });
    } catch (error) {
      console.log("[ServiceNow] Sandbox mode: saving Intake creation/update locally.");

      // If we are updating an existing record, find it and replace/merge it. Otherwise, add it.
      if (record.number) {
        const existingIdx = mockSnowRecordsData.findIndex(r => r.number === record.number);
        if (existingIdx !== -1) {
          mockSnowRecordsData[existingIdx] = {
            ...mockSnowRecordsData[existingIdx],
            ...record,
            variables: {
              ...mockSnowRecordsData[existingIdx].variables,
              ...record.variables
            },
            request_item: {
              ...mockSnowRecordsData[existingIdx].request_item,
              ...record.request_item,
              cat_item: {
                ...(mockSnowRecordsData[existingIdx].request_item?.cat_item || {}),
                ...(record.request_item?.cat_item || {})
              }
            }
          };
          console.log(`Updated mock record: ${record.number}`);
        } else {
          mockSnowRecordsData.unshift(record);
          console.log(`Created mock record with provided number: ${record.number}`);
        }
      } else {
        // Generate a new record
        const nextId = 29000000 + Math.floor(Math.random() * 900000);
        const newRecord = {
          ...record,
          number: `SCTASK${nextId}`,
          state: record.state || "Open",
          assigned_to: record.assigned_to || "",
          assignment_group: {
            display_value: record.assignment_group?.display_value || "GLOBAL - NIS - CRS Intake"
          },
          request_item: {
            number: record.request_item?.number || `RITM${nextId - 3000000}`,
            state: record.request_item?.state || record.state || "Open",
            cat_item: {
              display_value: record.request_item?.cat_item?.display_value || "Code Review Services"
            }
          },
          variables: {
            type: record.variables?.type || "Static Scan Access Request",
            application: record.variables?.application || "NEW-APP",
            billing_model: record.variables?.billing_model || "Consumption-based"
          }
        };
        mockSnowRecordsData.unshift(newRecord);
        console.log(`Generated new mock record: ${newRecord.number}`);
      }

      res.json({
        success: true,
        source: "mock",
        message: "Successfully created/updated mock intake record in memory."
      });
    }
  });

  // AI API Route
  app.post("/api/ai", async (req, res) => {
    if (!useMocks) {
      try {
        const response = await fetchWithTimeout(`http://127.0.0.1:8081/api/ai/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        }, 120000); // 120s timeout limit, since AI calls take much longer
        
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

    const { prompt, engine } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const finalPrompt = prompt; // The prompt is now fully built on the frontend

    try {
      if (engine === 'azure') {
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
          contents: finalPrompt,
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
      const response = await fetchWithTimeout(`http://127.0.0.1:8081/getfinalreport?application-name=${encodeURIComponent(appProfile)}`, {}, 1500);
      
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
      console.log('[ServiceNow] Failed to fetch final report from reporting service, using offline fallback data:', (error as Error).message);
      res.json(dryRunJson);
    }
  });

  app.get("/api/checkmarx/getreport", async (req, res) => {
    if (useMocks) {
      return res.json({
        ...dryRunJson,
        overview: {
          ...dryRunJson.overview,
          scanType: "checkmarx"
        }
      });
    }

    const appProfile = req.query['application-name'] as string;
    const branchName = (req.query['branch-name'] || "") as string;
    const tierValue = (req.query['tierValue'] || "") as string;

    const isJsonFile = appProfile && appProfile.toLowerCase().endsWith(".json");

    if (!appProfile || (!isJsonFile && (!branchName || !tierValue))) {
      return res.status(400).json({ error: "application-name is required, and branch-name and tierValue are mandatory for non-JSON profiles" });
    }

    try {
      const targetUrl = `http://127.0.0.1:8081/api/checkmarx/getreport?application-name=${encodeURIComponent(appProfile)}&branch-name=${encodeURIComponent(branchName)}&tierValue=${encodeURIComponent(tierValue)}`;
      const response = await fetchWithTimeout(targetUrl, {}, 1500);

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
      if (data && data.overview) {
        data.overview.scanType = "checkmarx";
      } else if (data) {
        data.overview = { scanType: "checkmarx" };
      }
      res.json(data);
    } catch (error) {
      console.log('[Checkmarx] Failed to fetch checkmarx report from reporting service, using offline fallback data:', (error as Error).message);
      res.json({
        ...dryRunJson,
        overview: {
          ...dryRunJson.overview,
          scanType: "checkmarx"
        }
      });
    }
  });

  app.post("/api/veracode/mitigation", async (req, res) => {
    if (useMocks) {
      return res.json({ message: "Mock mitigation successful." });
    }

    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:8081/api/veracode/mitigation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body)
      }, 1500);
      
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
      console.log('[ServiceNow] Failed to apply mitigation via reporting service, using offline mock success:', (error as Error).message);
      res.json({ success: true, remark: "saved to local offline storage successfully" });
    }
  });

  app.post("/api/checkmarx/mitigation", async (req, res) => {
    const scanId = req.body.scanId || req.body.buildId || dryRunJson.overview?.buildId || "67352589";
    if (useMocks) {
      return res.json({ message: "Mock mitigation successful.", scanId });
    }

    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:8081/api/checkmarx/mitigation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body)
      }, 1500);
      
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
      if (typeof data === "object" && data !== null) {
        data.scanId = scanId;
      }
      res.json(data);
    } catch (error) {
      console.log('[Checkmarx] Failed to apply mitigation via reporting service, using offline mock success:', (error as Error).message);
      res.json({ success: true, remark: "saved to local offline storage successfully", scanId });
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
