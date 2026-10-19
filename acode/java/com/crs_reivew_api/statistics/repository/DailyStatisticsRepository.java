package com.crs_reivew_api.statistics.repository;

import com.crs_reivew_api.statistics.entity.DailyStatisticsEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;

@Repository
public interface DailyStatisticsRepository extends JpaRepository<DailyStatisticsEntity, LocalDate> {

    java.util.List<DailyStatisticsEntity> findByStatDateBetween(LocalDate startDate, LocalDate endDate);
}
