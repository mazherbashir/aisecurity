package com.crs_reivew_api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Data Transfer Object representing an existing duplicate ServiceNow Catalog Task (sc_task)
 * identified for the same Application Profile Name.
 *
 * Fields mirror the PowerShell duplicate check output:
 * - SCTASK : number
 * - RITM   : request_item.number
 * - State  : state
 * - Title  : short_description
 * - Owner  : assigned_to
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class SnowDuplicateTaskDTO {

    public String sctask;
    public String ritm;
    public String state;
    public String title;
    public String owner;
    public String requestor;
    public String sysId;

    public SnowDuplicateTaskDTO() {}

    public SnowDuplicateTaskDTO(String sctask, String ritm, String state, String title, String owner) {
        this.sctask = sctask;
        this.ritm = ritm;
        this.state = state;
        this.title = title;
        this.owner = owner;
    }

    public SnowDuplicateTaskDTO(String number, String requestItemNumber, String state, String shortDescription, String assignedTo, String sysId) {
        this.sctask = number;
        this.ritm = requestItemNumber;
        this.state = state;
        this.title = shortDescription;
        this.owner = assignedTo;
        this.sysId = sysId;
    }

    public SnowDuplicateTaskDTO(String number, String requestItemNumber, String state, String shortDescription, String assignedTo, String requestor, String sysId) {
        this.sctask = number;
        this.ritm = requestItemNumber;
        this.state = state;
        this.title = shortDescription;
        this.owner = assignedTo;
        this.requestor = requestor;
        this.sysId = sysId;
    }

    public String getSctask() {
        return sctask;
    }

    public void setSctask(String sctask) {
        this.sctask = sctask;
    }

    public String getRitm() {
        return ritm;
    }

    public void setRitm(String ritm) {
        this.ritm = ritm;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    // Aliases for compatibility with SnowService / TicketScheduler methods
    public String getNumber() {
        return sctask;
    }

    public void setNumber(String number) {
        this.sctask = number;
    }

    public String getRequestItemNumber() {
        return ritm;
    }

    public void setRequestItemNumber(String requestItemNumber) {
        this.ritm = requestItemNumber;
    }

    public String getShortDescription() {
        return title;
    }

    public void setShortDescription(String shortDescription) {
        this.title = shortDescription;
    }

    public String getAssignedTo() {
        return owner;
    }

    public void setAssignedTo(String assignedTo) {
        this.owner = assignedTo;
    }

    public String getRequestor() {
        return requestor;
    }

    public void setRequestor(String requestor) {
        this.requestor = requestor;
    }

    public String getSysId() {
        return sysId;
    }

    public void setSysId(String sysId) {
        this.sysId = sysId;
    }

    @Override
    public String toString() {
        return "SnowDuplicateTaskDTO{" +
                "sctask='" + sctask + '\'' +
                ", ritm='" + ritm + '\'' +
                ", state='" + state + '\'' +
                ", title='" + title + '\'' +
                ", owner='" + owner + '\'' +
                ", requestor='" + requestor + '\'' +
                '}';
    }
}
