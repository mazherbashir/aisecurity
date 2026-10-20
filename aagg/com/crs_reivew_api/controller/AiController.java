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

            if (prompt == null || prompt.isEmpty()) throw new IllegalArgumentException("Prompt is required");

            AiService.AnalysisResult analysis = aiService.analyzeFinding(engine, type, flawId, flawSummary, prompt);

            response.put("status", "success");
            response.put("result", analysis.result);
            if (analysis.auditVerdict != null) {
                response.put("auditVerdict", analysis.auditVerdict);
            }
            response.put("in", analysis.inTokens);
            response.put("out", analysis.outTokens);
            response.put("engine", engine != null ? engine : "gemini");
        } catch (Exception e) {
            logger.error("AI analysis error: {}", e.getMessage(), e);
            response.put("status", "error");
            response.put("message", e.getMessage());
        }
        return response;
    }
}
