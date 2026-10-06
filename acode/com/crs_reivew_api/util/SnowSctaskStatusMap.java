package com.crs_reivew_api.util;

import java.util.HashMap;
import java.util.Map;

public enum SnowSctaskStatusMap {
    PENDING("-5"),
    ASSESS_VALIDATE("54"),
    OPEN("1"),
    WORK_IN_PROGRESS("2"),
    CLOSED_COMPLETE("3"),
    CLOSED_INCOMPLETE("4"),
    CLOSED_SKIPPED("7"),
    RESPONDED("8"),
    NO_RESPONSE("9");

    private final String code;
    private static final Map<String, String> LOOKUP_MAP = new HashMap<>();

    static {
        for (SnowSctaskStatusMap status : values()) {
            LOOKUP_MAP.put(status.code, status.code);
        }

        LOOKUP_MAP.put("PENDING", PENDING.code);
        LOOKUP_MAP.put("ASSESS VALIDATE", ASSESS_VALIDATE.code);
        LOOKUP_MAP.put("ASSESS/VALIDATE", ASSESS_VALIDATE.code);
        LOOKUP_MAP.put("ASSESS_VALIDATE", ASSESS_VALIDATE.code);

        LOOKUP_MAP.put("OPEN", OPEN.code);

        LOOKUP_MAP.put("WORK IN PROGRESS", WORK_IN_PROGRESS.code);
        LOOKUP_MAP.put("WORK_IN_PROGRESS", WORK_IN_PROGRESS.code);
        LOOKUP_MAP.put("WORKINPROGRESS", WORK_IN_PROGRESS.code);

        LOOKUP_MAP.put("CLOSED COMPLETE", CLOSED_COMPLETE.code);
        LOOKUP_MAP.put("CLOSED_COMPLETE", CLOSED_COMPLETE.code);
        LOOKUP_MAP.put("CLOSEDCOMPLETE", CLOSED_COMPLETE.code);

        LOOKUP_MAP.put("CLOSED INCOMPLETE", CLOSED_INCOMPLETE.code);
        LOOKUP_MAP.put("CLOSED_INCOMPLETE", CLOSED_INCOMPLETE.code);
        LOOKUP_MAP.put("CLOSEDINCOMPLETE", CLOSED_INCOMPLETE.code);

        LOOKUP_MAP.put("CLOSED SKIPPED", CLOSED_SKIPPED.code);
        LOOKUP_MAP.put("CLOSED_SKIPPED", CLOSED_SKIPPED.code);
        LOOKUP_MAP.put("CLOSEDSKIPPED", CLOSED_SKIPPED.code);

        LOOKUP_MAP.put("RESPONDED", RESPONDED.code);

        LOOKUP_MAP.put("NO RESPONSE", NO_RESPONSE.code);
        LOOKUP_MAP.put("NO_RESPONSE", NO_RESPONSE.code);
        LOOKUP_MAP.put("NORESPONSE", NO_RESPONSE.code);
    }

    SnowSctaskStatusMap(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /**
     * Resolves input status string (text or numeric) to ServiceNow state code.
     * E.g.:
     * - "Closed Complete" -> "3"
     * - "3" -> "3"
     * - "Pending" -> "-5"
     * - "Responded" -> "8"
     */
    public static String resolveStatusToStateCode(String inputStatus) {
        if (inputStatus == null || inputStatus.trim().isEmpty()) {
            return null;
        }
        String clean = inputStatus.trim();
        String normalized = clean.toUpperCase();

        if (LOOKUP_MAP.containsKey(normalized)) {
            return LOOKUP_MAP.get(normalized);
        }

        return clean;
    }
}
