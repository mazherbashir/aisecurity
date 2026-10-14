package com.crs_reivew_api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class SnowScTaskUpdateRequestDTO {

    @JsonProperty("u_number")
    public String uNumber;

    @JsonProperty("u_action")
    public String uAction;

    @JsonProperty("u_state")
    public String uState;

    @JsonProperty("u_additional_comments")
    public String uAdditionalComments;

    @JsonProperty("u_work_notes")
    public String uWorkNotes;

    @JsonProperty("u_assigned_to")
    public String uAssignedTo;

    @JsonProperty("u_closure_message")
    public String uClosureMessage;

    @JsonProperty("u_end_pending")
    public String uEndPending;

    @JsonProperty("u_pending_reason")
    public String uPendingReason;

    public SnowScTaskUpdateRequestDTO() {}

    public String getUNumber() {
        return uNumber;
    }

    public void setUNumber(String uNumber) {
        this.uNumber = uNumber;
    }

    public String getUAction() {
        return uAction;
    }

    public void setUAction(String uAction) {
        this.uAction = uAction;
    }

    public String getUState() {
        return uState;
    }

    public void setUState(String uState) {
        this.uState = uState;
    }

    public String getUAdditionalComments() {
        return uAdditionalComments;
    }

    public void setUAdditionalComments(String uAdditionalComments) {
        this.uAdditionalComments = uAdditionalComments;
    }

    public String getUWorkNotes() {
        return uWorkNotes;
    }

    public void setUWorkNotes(String uWorkNotes) {
        this.uWorkNotes = uWorkNotes;
    }

    public String getUAssignedTo() {
        return uAssignedTo;
    }

    public void setUAssignedTo(String uAssignedTo) {
        this.uAssignedTo = uAssignedTo;
    }

    public String getUClosureMessage() {
        return uClosureMessage;
    }

    public void setUClosureMessage(String uClosureMessage) {
        this.uClosureMessage = uClosureMessage;
    }

    public String getUEndPending() {
        return uEndPending;
    }

    public void setUEndPending(String uEndPending) {
        this.uEndPending = uEndPending;
    }

    public String getUPendingReason() {
        return uPendingReason;
    }

    public void setUPendingReason(String uPendingReason) {
        this.uPendingReason = uPendingReason;
    }
}
