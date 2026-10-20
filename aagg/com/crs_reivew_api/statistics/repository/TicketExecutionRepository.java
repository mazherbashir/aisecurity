package com.crs_reivew_api.statistics.repository;

import com.crs_reivew_api.statistics.entity.TicketExecutionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TicketExecutionRepository extends JpaRepository<TicketExecutionEntity, Long> {

    List<TicketExecutionEntity> findTop20ByOrderByProcessedAtDesc();

    List<TicketExecutionEntity> findByProcessedAtBetweenOrderByProcessedAtDesc(LocalDateTime start, LocalDateTime end);

    long countByProcessedAtBetween(LocalDateTime start, LocalDateTime end);
}
