package com.crs_reivew_api.controller;

import com.crs_reivew_api.service.AiService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private static final Logger logger = LoggerFactory.getLogger(AiController.class);

    @Autowired
    private AiService aiService;

    @Autowired
    private com.crs_reivew_api.config.VeracodeConfig veracodeConfig;

    @PostMapping("/analyze")
    public Map<String, Object> analyze(@RequestBody Map<String, String> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String engine = payload.get("engine");
            String prompt = payload.get("prompt");
            String type = payload.get("type");
            String flawId = payload.get("flawId");
            String flawSummary = payload.get("flawSummary");

            if (engine == null || engine.isEmpty()) engine = "gemini";
            if (prompt == null || prompt.isEmpty()) throw new IllegalArgumentException("Prompt is required");

            String fullPrompt = prompt;
            if ("SAST".equalsIgnoreCase(type)) {
                fullPrompt = veracodeConfig.getSastPrompt() + "\n\n" +
                             "this is the flaw id " + flawId + "\n" +
                             flawSummary + "\n\n" + prompt;
            } else if ("SCA".equalsIgnoreCase(type)) {
                fullPrompt = veracodeConfig.getScaPrompt() + "\n\n" +
                             "this is the flaw id " + flawId + "\n" +
                             flawSummary + "\n\n" + prompt;
            }

            logger.info("Analyzing with engine: {}, type: {}", engine, type);
            AiService.AiResult result = aiService.callAi(engine, fullPrompt);

            int totalInTokens = result.inTokens;
            int totalOutTokens = result.outTokens;
            String finalResultText = result.text;

            if (veracodeConfig.isSecondaryAuditEnabled()) {
                logger.info("Executing Phase 2: Secondary Audit Verification using model: {}", veracodeConfig.getAuditorModelName());
                try {
                    String auditorPromptSystem = veracodeConfig.getAuditorPrompt();
                    String auditorFullPrompt = auditorPromptSystem + "\n\n" +
                                               "[Original Request Data]:\n" + fullPrompt + "\n\n" +
                                               "[Phase 1 Output]:\n" + result.text;

                    AiService.AiResult auditResult = aiService.callAuditorService(veracodeConfig.getAuditorModelName(), auditorFullPrompt);
                    totalInTokens += auditResult.inTokens;
                    totalOutTokens += auditResult.outTokens;

                    boolean agrees = true;
                    String verdictText = auditResult.text.toLowerCase();
                    int verdictIndex = verdictText.indexOf("validation verdict");
                    if (verdictIndex != -1) {
                        int endOfLine = auditResult.text.indexOf("\n", verdictIndex);
                        String verdictLine = (endOfLine == -1) ? 
                            auditResult.text.substring(verdictIndex) : 
                            auditResult.text.substring(verdictIndex, endOfLine);
                        
                        if (verdictLine.toLowerCase().contains("disagree")) {
                            agrees = false;
                        }
                    }

                    if (!agrees) {
                        logger.warn("AUDIT CONTRADICTION DETECTED: Secondary Auditor disagreed with Phase 1 Verdict.");
                        finalResultText = veracodeConfig.getAuditorDisagreeFallbackText();
                        aiService.saveAuditFailureLog(fullPrompt, result.text, auditResult.text);
                        response.put("auditVerdict", "Disagree");
                    } else {
                        logger.info("Secondary Auditor agreed with Phase 1 Verdict.");
                        response.put("auditVerdict", "Agree");
                    }
                } catch (Exception auditEx) {
                    logger.error("Secondary Audit failed, continuing with primary AI result. Error: {}", auditEx.getMessage(), auditEx);
                }
            }

            response.put("status", "success");
            response.put("result", finalResultText);
            response.put("in", totalInTokens);
            response.put("out", totalOutTokens);
            response.put("engine", engine);
        } catch (Exception e) {
            logger.error("AI analysis error: {}", e.getMessage(), e);
            response.put("status", "error");
            response.put("message", e.getMessage());
        }
        return response;
    }
}
