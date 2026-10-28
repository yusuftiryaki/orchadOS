// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $SessionsTable extends Sessions
    with TableInfo<$SessionsTable, SessionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SessionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _parcelIdMeta = const VerificationMeta(
    'parcelId',
  );
  @override
  late final GeneratedColumn<String> parcelId = GeneratedColumn<String>(
    'parcel_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _taskIdMeta = const VerificationMeta('taskId');
  @override
  late final GeneratedColumn<String> taskId = GeneratedColumn<String>(
    'task_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sessionTypeMeta = const VerificationMeta(
    'sessionType',
  );
  @override
  late final GeneratedColumn<String> sessionType = GeneratedColumn<String>(
    'session_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _visitKindMeta = const VerificationMeta(
    'visitKind',
  );
  @override
  late final GeneratedColumn<String> visitKind = GeneratedColumn<String>(
    'visit_kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _seasonMeta = const VerificationMeta('season');
  @override
  late final GeneratedColumn<String> season = GeneratedColumn<String>(
    'season',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _operatorIdMeta = const VerificationMeta(
    'operatorId',
  );
  @override
  late final GeneratedColumn<String> operatorId = GeneratedColumn<String>(
    'operator_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _methodologyVersionMeta =
      const VerificationMeta('methodologyVersion');
  @override
  late final GeneratedColumn<String> methodologyVersion =
      GeneratedColumn<String>(
        'methodology_version',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _appVersionMeta = const VerificationMeta(
    'appVersion',
  );
  @override
  late final GeneratedColumn<String> appVersion = GeneratedColumn<String>(
    'app_version',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _loggerNameMeta = const VerificationMeta(
    'loggerName',
  );
  @override
  late final GeneratedColumn<String> loggerName = GeneratedColumn<String>(
    'logger_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _loggerFirmwareMeta = const VerificationMeta(
    'loggerFirmware',
  );
  @override
  late final GeneratedColumn<String> loggerFirmware = GeneratedColumn<String>(
    'logger_firmware',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _startedAtMeta = const VerificationMeta(
    'startedAt',
  );
  @override
  late final GeneratedColumn<DateTime> startedAt = GeneratedColumn<DateTime>(
    'started_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _startGpsTimeMsMeta = const VerificationMeta(
    'startGpsTimeMs',
  );
  @override
  late final GeneratedColumn<int> startGpsTimeMs = GeneratedColumn<int>(
    'start_gps_time_ms',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _stoppedAtMeta = const VerificationMeta(
    'stoppedAt',
  );
  @override
  late final GeneratedColumn<DateTime> stoppedAt = GeneratedColumn<DateTime>(
    'stopped_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _stopGpsTimeMsMeta = const VerificationMeta(
    'stopGpsTimeMs',
  );
  @override
  late final GeneratedColumn<int> stopGpsTimeMs = GeneratedColumn<int>(
    'stop_gps_time_ms',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _scanPlatformMeta = const VerificationMeta(
    'scanPlatform',
  );
  @override
  late final GeneratedColumn<String> scanPlatform = GeneratedColumn<String>(
    'scan_platform',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cameraHeightMMeta = const VerificationMeta(
    'cameraHeightM',
  );
  @override
  late final GeneratedColumn<double> cameraHeightM = GeneratedColumn<double>(
    'camera_height_m',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    parcelId,
    taskId,
    sessionType,
    visitKind,
    season,
    operatorId,
    methodologyVersion,
    appVersion,
    loggerName,
    loggerFirmware,
    startedAt,
    startGpsTimeMs,
    stoppedAt,
    stopGpsTimeMs,
    status,
    scanPlatform,
    cameraHeightM,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sessions';
  @override
  VerificationContext validateIntegrity(
    Insertable<SessionRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('parcel_id')) {
      context.handle(
        _parcelIdMeta,
        parcelId.isAcceptableOrUnknown(data['parcel_id']!, _parcelIdMeta),
      );
    } else if (isInserting) {
      context.missing(_parcelIdMeta);
    }
    if (data.containsKey('task_id')) {
      context.handle(
        _taskIdMeta,
        taskId.isAcceptableOrUnknown(data['task_id']!, _taskIdMeta),
      );
    }
    if (data.containsKey('session_type')) {
      context.handle(
        _sessionTypeMeta,
        sessionType.isAcceptableOrUnknown(
          data['session_type']!,
          _sessionTypeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_sessionTypeMeta);
    }
    if (data.containsKey('visit_kind')) {
      context.handle(
        _visitKindMeta,
        visitKind.isAcceptableOrUnknown(data['visit_kind']!, _visitKindMeta),
      );
    } else if (isInserting) {
      context.missing(_visitKindMeta);
    }
    if (data.containsKey('season')) {
      context.handle(
        _seasonMeta,
        season.isAcceptableOrUnknown(data['season']!, _seasonMeta),
      );
    }
    if (data.containsKey('operator_id')) {
      context.handle(
        _operatorIdMeta,
        operatorId.isAcceptableOrUnknown(data['operator_id']!, _operatorIdMeta),
      );
    }
    if (data.containsKey('methodology_version')) {
      context.handle(
        _methodologyVersionMeta,
        methodologyVersion.isAcceptableOrUnknown(
          data['methodology_version']!,
          _methodologyVersionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_methodologyVersionMeta);
    }
    if (data.containsKey('app_version')) {
      context.handle(
        _appVersionMeta,
        appVersion.isAcceptableOrUnknown(data['app_version']!, _appVersionMeta),
      );
    } else if (isInserting) {
      context.missing(_appVersionMeta);
    }
    if (data.containsKey('logger_name')) {
      context.handle(
        _loggerNameMeta,
        loggerName.isAcceptableOrUnknown(data['logger_name']!, _loggerNameMeta),
      );
    }
    if (data.containsKey('logger_firmware')) {
      context.handle(
        _loggerFirmwareMeta,
        loggerFirmware.isAcceptableOrUnknown(
          data['logger_firmware']!,
          _loggerFirmwareMeta,
        ),
      );
    }
    if (data.containsKey('started_at')) {
      context.handle(
        _startedAtMeta,
        startedAt.isAcceptableOrUnknown(data['started_at']!, _startedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_startedAtMeta);
    }
    if (data.containsKey('start_gps_time_ms')) {
      context.handle(
        _startGpsTimeMsMeta,
        startGpsTimeMs.isAcceptableOrUnknown(
          data['start_gps_time_ms']!,
          _startGpsTimeMsMeta,
        ),
      );
    }
    if (data.containsKey('stopped_at')) {
      context.handle(
        _stoppedAtMeta,
        stoppedAt.isAcceptableOrUnknown(data['stopped_at']!, _stoppedAtMeta),
      );
    }
    if (data.containsKey('stop_gps_time_ms')) {
      context.handle(
        _stopGpsTimeMsMeta,
        stopGpsTimeMs.isAcceptableOrUnknown(
          data['stop_gps_time_ms']!,
          _stopGpsTimeMsMeta,
        ),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('scan_platform')) {
      context.handle(
        _scanPlatformMeta,
        scanPlatform.isAcceptableOrUnknown(
          data['scan_platform']!,
          _scanPlatformMeta,
        ),
      );
    }
    if (data.containsKey('camera_height_m')) {
      context.handle(
        _cameraHeightMMeta,
        cameraHeightM.isAcceptableOrUnknown(
          data['camera_height_m']!,
          _cameraHeightMMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SessionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SessionRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      parcelId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parcel_id'],
      )!,
      taskId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}task_id'],
      ),
      sessionType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_type'],
      )!,
      visitKind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}visit_kind'],
      )!,
      season: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}season'],
      ),
      operatorId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operator_id'],
      ),
      methodologyVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}methodology_version'],
      )!,
      appVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}app_version'],
      )!,
      loggerName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}logger_name'],
      ),
      loggerFirmware: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}logger_firmware'],
      ),
      startedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}started_at'],
      )!,
      startGpsTimeMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}start_gps_time_ms'],
      ),
      stoppedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}stopped_at'],
      ),
      stopGpsTimeMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}stop_gps_time_ms'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      scanPlatform: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}scan_platform'],
      ),
      cameraHeightM: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}camera_height_m'],
      ),
    );
  }

  @override
  $SessionsTable createAlias(String alias) {
    return $SessionsTable(attachedDatabase, alias);
  }
}

class SessionRow extends DataClass implements Insertable<SessionRow> {
  /// UUID; also the logger's `session_id` (folder name on the SD card).
  final String id;
  final String parcelId;
  final String? taskId;

  /// Session type in the target model: `scan` for kit sessions.
  final String sessionType;

  /// `inventory` or `periodic`.
  final String visitKind;
  final String? season;

  /// Auth user id of the field operator (no name or phone here).
  final String? operatorId;
  final String methodologyVersion;
  final String appVersion;

  /// Logger device name and firmware version.
  final String? loggerName;
  final String? loggerFirmware;
  final DateTime startedAt;
  final int? startGpsTimeMs;
  final DateTime? stoppedAt;
  final int? stopGpsTimeMs;

  /// `recording`, `stopped` or `closed` (visit summary confirmed); `blocked`
  /// when the visit could not be done and nothing was recorded (local only,
  /// never sent as a visit update).
  final String status;

  /// How the scan was done (schema 6): `walk` (backpack pole),
  /// `motorcycle` or `robot`; `public.session.scan_platform`. Null on
  /// verification tours and on rows from before schema 6.
  final String? scanPlatform;

  /// Measured camera height, lens to ground, in metres (0.50–3.50,
  /// two decimals); `public.session.camera_height_m`.
  final double? cameraHeightM;
  const SessionRow({
    required this.id,
    required this.parcelId,
    this.taskId,
    required this.sessionType,
    required this.visitKind,
    this.season,
    this.operatorId,
    required this.methodologyVersion,
    required this.appVersion,
    this.loggerName,
    this.loggerFirmware,
    required this.startedAt,
    this.startGpsTimeMs,
    this.stoppedAt,
    this.stopGpsTimeMs,
    required this.status,
    this.scanPlatform,
    this.cameraHeightM,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['parcel_id'] = Variable<String>(parcelId);
    if (!nullToAbsent || taskId != null) {
      map['task_id'] = Variable<String>(taskId);
    }
    map['session_type'] = Variable<String>(sessionType);
    map['visit_kind'] = Variable<String>(visitKind);
    if (!nullToAbsent || season != null) {
      map['season'] = Variable<String>(season);
    }
    if (!nullToAbsent || operatorId != null) {
      map['operator_id'] = Variable<String>(operatorId);
    }
    map['methodology_version'] = Variable<String>(methodologyVersion);
    map['app_version'] = Variable<String>(appVersion);
    if (!nullToAbsent || loggerName != null) {
      map['logger_name'] = Variable<String>(loggerName);
    }
    if (!nullToAbsent || loggerFirmware != null) {
      map['logger_firmware'] = Variable<String>(loggerFirmware);
    }
    map['started_at'] = Variable<DateTime>(startedAt);
    if (!nullToAbsent || startGpsTimeMs != null) {
      map['start_gps_time_ms'] = Variable<int>(startGpsTimeMs);
    }
    if (!nullToAbsent || stoppedAt != null) {
      map['stopped_at'] = Variable<DateTime>(stoppedAt);
    }
    if (!nullToAbsent || stopGpsTimeMs != null) {
      map['stop_gps_time_ms'] = Variable<int>(stopGpsTimeMs);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || scanPlatform != null) {
      map['scan_platform'] = Variable<String>(scanPlatform);
    }
    if (!nullToAbsent || cameraHeightM != null) {
      map['camera_height_m'] = Variable<double>(cameraHeightM);
    }
    return map;
  }

  SessionsCompanion toCompanion(bool nullToAbsent) {
    return SessionsCompanion(
      id: Value(id),
      parcelId: Value(parcelId),
      taskId: taskId == null && nullToAbsent
          ? const Value.absent()
          : Value(taskId),
      sessionType: Value(sessionType),
      visitKind: Value(visitKind),
      season: season == null && nullToAbsent
          ? const Value.absent()
          : Value(season),
      operatorId: operatorId == null && nullToAbsent
          ? const Value.absent()
          : Value(operatorId),
      methodologyVersion: Value(methodologyVersion),
      appVersion: Value(appVersion),
      loggerName: loggerName == null && nullToAbsent
          ? const Value.absent()
          : Value(loggerName),
      loggerFirmware: loggerFirmware == null && nullToAbsent
          ? const Value.absent()
          : Value(loggerFirmware),
      startedAt: Value(startedAt),
      startGpsTimeMs: startGpsTimeMs == null && nullToAbsent
          ? const Value.absent()
          : Value(startGpsTimeMs),
      stoppedAt: stoppedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(stoppedAt),
      stopGpsTimeMs: stopGpsTimeMs == null && nullToAbsent
          ? const Value.absent()
          : Value(stopGpsTimeMs),
      status: Value(status),
      scanPlatform: scanPlatform == null && nullToAbsent
          ? const Value.absent()
          : Value(scanPlatform),
      cameraHeightM: cameraHeightM == null && nullToAbsent
          ? const Value.absent()
          : Value(cameraHeightM),
    );
  }

  factory SessionRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SessionRow(
      id: serializer.fromJson<String>(json['id']),
      parcelId: serializer.fromJson<String>(json['parcelId']),
      taskId: serializer.fromJson<String?>(json['taskId']),
      sessionType: serializer.fromJson<String>(json['sessionType']),
      visitKind: serializer.fromJson<String>(json['visitKind']),
      season: serializer.fromJson<String?>(json['season']),
      operatorId: serializer.fromJson<String?>(json['operatorId']),
      methodologyVersion: serializer.fromJson<String>(
        json['methodologyVersion'],
      ),
      appVersion: serializer.fromJson<String>(json['appVersion']),
      loggerName: serializer.fromJson<String?>(json['loggerName']),
      loggerFirmware: serializer.fromJson<String?>(json['loggerFirmware']),
      startedAt: serializer.fromJson<DateTime>(json['startedAt']),
      startGpsTimeMs: serializer.fromJson<int?>(json['startGpsTimeMs']),
      stoppedAt: serializer.fromJson<DateTime?>(json['stoppedAt']),
      stopGpsTimeMs: serializer.fromJson<int?>(json['stopGpsTimeMs']),
      status: serializer.fromJson<String>(json['status']),
      scanPlatform: serializer.fromJson<String?>(json['scanPlatform']),
      cameraHeightM: serializer.fromJson<double?>(json['cameraHeightM']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'parcelId': serializer.toJson<String>(parcelId),
      'taskId': serializer.toJson<String?>(taskId),
      'sessionType': serializer.toJson<String>(sessionType),
      'visitKind': serializer.toJson<String>(visitKind),
      'season': serializer.toJson<String?>(season),
      'operatorId': serializer.toJson<String?>(operatorId),
      'methodologyVersion': serializer.toJson<String>(methodologyVersion),
      'appVersion': serializer.toJson<String>(appVersion),
      'loggerName': serializer.toJson<String?>(loggerName),
      'loggerFirmware': serializer.toJson<String?>(loggerFirmware),
      'startedAt': serializer.toJson<DateTime>(startedAt),
      'startGpsTimeMs': serializer.toJson<int?>(startGpsTimeMs),
      'stoppedAt': serializer.toJson<DateTime?>(stoppedAt),
      'stopGpsTimeMs': serializer.toJson<int?>(stopGpsTimeMs),
      'status': serializer.toJson<String>(status),
      'scanPlatform': serializer.toJson<String?>(scanPlatform),
      'cameraHeightM': serializer.toJson<double?>(cameraHeightM),
    };
  }

  SessionRow copyWith({
    String? id,
    String? parcelId,
    Value<String?> taskId = const Value.absent(),
    String? sessionType,
    String? visitKind,
    Value<String?> season = const Value.absent(),
    Value<String?> operatorId = const Value.absent(),
    String? methodologyVersion,
    String? appVersion,
    Value<String?> loggerName = const Value.absent(),
    Value<String?> loggerFirmware = const Value.absent(),
    DateTime? startedAt,
    Value<int?> startGpsTimeMs = const Value.absent(),
    Value<DateTime?> stoppedAt = const Value.absent(),
    Value<int?> stopGpsTimeMs = const Value.absent(),
    String? status,
    Value<String?> scanPlatform = const Value.absent(),
    Value<double?> cameraHeightM = const Value.absent(),
  }) => SessionRow(
    id: id ?? this.id,
    parcelId: parcelId ?? this.parcelId,
    taskId: taskId.present ? taskId.value : this.taskId,
    sessionType: sessionType ?? this.sessionType,
    visitKind: visitKind ?? this.visitKind,
    season: season.present ? season.value : this.season,
    operatorId: operatorId.present ? operatorId.value : this.operatorId,
    methodologyVersion: methodologyVersion ?? this.methodologyVersion,
    appVersion: appVersion ?? this.appVersion,
    loggerName: loggerName.present ? loggerName.value : this.loggerName,
    loggerFirmware: loggerFirmware.present
        ? loggerFirmware.value
        : this.loggerFirmware,
    startedAt: startedAt ?? this.startedAt,
    startGpsTimeMs: startGpsTimeMs.present
        ? startGpsTimeMs.value
        : this.startGpsTimeMs,
    stoppedAt: stoppedAt.present ? stoppedAt.value : this.stoppedAt,
    stopGpsTimeMs: stopGpsTimeMs.present
        ? stopGpsTimeMs.value
        : this.stopGpsTimeMs,
    status: status ?? this.status,
    scanPlatform: scanPlatform.present ? scanPlatform.value : this.scanPlatform,
    cameraHeightM: cameraHeightM.present
        ? cameraHeightM.value
        : this.cameraHeightM,
  );
  SessionRow copyWithCompanion(SessionsCompanion data) {
    return SessionRow(
      id: data.id.present ? data.id.value : this.id,
      parcelId: data.parcelId.present ? data.parcelId.value : this.parcelId,
      taskId: data.taskId.present ? data.taskId.value : this.taskId,
      sessionType: data.sessionType.present
          ? data.sessionType.value
          : this.sessionType,
      visitKind: data.visitKind.present ? data.visitKind.value : this.visitKind,
      season: data.season.present ? data.season.value : this.season,
      operatorId: data.operatorId.present
          ? data.operatorId.value
          : this.operatorId,
      methodologyVersion: data.methodologyVersion.present
          ? data.methodologyVersion.value
          : this.methodologyVersion,
      appVersion: data.appVersion.present
          ? data.appVersion.value
          : this.appVersion,
      loggerName: data.loggerName.present
          ? data.loggerName.value
          : this.loggerName,
      loggerFirmware: data.loggerFirmware.present
          ? data.loggerFirmware.value
          : this.loggerFirmware,
      startedAt: data.startedAt.present ? data.startedAt.value : this.startedAt,
      startGpsTimeMs: data.startGpsTimeMs.present
          ? data.startGpsTimeMs.value
          : this.startGpsTimeMs,
      stoppedAt: data.stoppedAt.present ? data.stoppedAt.value : this.stoppedAt,
      stopGpsTimeMs: data.stopGpsTimeMs.present
          ? data.stopGpsTimeMs.value
          : this.stopGpsTimeMs,
      status: data.status.present ? data.status.value : this.status,
      scanPlatform: data.scanPlatform.present
          ? data.scanPlatform.value
          : this.scanPlatform,
      cameraHeightM: data.cameraHeightM.present
          ? data.cameraHeightM.value
          : this.cameraHeightM,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SessionRow(')
          ..write('id: $id, ')
          ..write('parcelId: $parcelId, ')
          ..write('taskId: $taskId, ')
          ..write('sessionType: $sessionType, ')
          ..write('visitKind: $visitKind, ')
          ..write('season: $season, ')
          ..write('operatorId: $operatorId, ')
          ..write('methodologyVersion: $methodologyVersion, ')
          ..write('appVersion: $appVersion, ')
          ..write('loggerName: $loggerName, ')
          ..write('loggerFirmware: $loggerFirmware, ')
          ..write('startedAt: $startedAt, ')
          ..write('startGpsTimeMs: $startGpsTimeMs, ')
          ..write('stoppedAt: $stoppedAt, ')
          ..write('stopGpsTimeMs: $stopGpsTimeMs, ')
          ..write('status: $status, ')
          ..write('scanPlatform: $scanPlatform, ')
          ..write('cameraHeightM: $cameraHeightM')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    parcelId,
    taskId,
    sessionType,
    visitKind,
    season,
    operatorId,
    methodologyVersion,
    appVersion,
    loggerName,
    loggerFirmware,
    startedAt,
    startGpsTimeMs,
    stoppedAt,
    stopGpsTimeMs,
    status,
    scanPlatform,
    cameraHeightM,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SessionRow &&
          other.id == this.id &&
          other.parcelId == this.parcelId &&
          other.taskId == this.taskId &&
          other.sessionType == this.sessionType &&
          other.visitKind == this.visitKind &&
          other.season == this.season &&
          other.operatorId == this.operatorId &&
          other.methodologyVersion == this.methodologyVersion &&
          other.appVersion == this.appVersion &&
          other.loggerName == this.loggerName &&
          other.loggerFirmware == this.loggerFirmware &&
          other.startedAt == this.startedAt &&
          other.startGpsTimeMs == this.startGpsTimeMs &&
          other.stoppedAt == this.stoppedAt &&
          other.stopGpsTimeMs == this.stopGpsTimeMs &&
          other.status == this.status &&
          other.scanPlatform == this.scanPlatform &&
          other.cameraHeightM == this.cameraHeightM);
}

class SessionsCompanion extends UpdateCompanion<SessionRow> {
  final Value<String> id;
  final Value<String> parcelId;
  final Value<String?> taskId;
  final Value<String> sessionType;
  final Value<String> visitKind;
  final Value<String?> season;
  final Value<String?> operatorId;
  final Value<String> methodologyVersion;
  final Value<String> appVersion;
  final Value<String?> loggerName;
  final Value<String?> loggerFirmware;
  final Value<DateTime> startedAt;
  final Value<int?> startGpsTimeMs;
  final Value<DateTime?> stoppedAt;
  final Value<int?> stopGpsTimeMs;
  final Value<String> status;
  final Value<String?> scanPlatform;
  final Value<double?> cameraHeightM;
  final Value<int> rowid;
  const SessionsCompanion({
    this.id = const Value.absent(),
    this.parcelId = const Value.absent(),
    this.taskId = const Value.absent(),
    this.sessionType = const Value.absent(),
    this.visitKind = const Value.absent(),
    this.season = const Value.absent(),
    this.operatorId = const Value.absent(),
    this.methodologyVersion = const Value.absent(),
    this.appVersion = const Value.absent(),
    this.loggerName = const Value.absent(),
    this.loggerFirmware = const Value.absent(),
    this.startedAt = const Value.absent(),
    this.startGpsTimeMs = const Value.absent(),
    this.stoppedAt = const Value.absent(),
    this.stopGpsTimeMs = const Value.absent(),
    this.status = const Value.absent(),
    this.scanPlatform = const Value.absent(),
    this.cameraHeightM = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SessionsCompanion.insert({
    required String id,
    required String parcelId,
    this.taskId = const Value.absent(),
    required String sessionType,
    required String visitKind,
    this.season = const Value.absent(),
    this.operatorId = const Value.absent(),
    required String methodologyVersion,
    required String appVersion,
    this.loggerName = const Value.absent(),
    this.loggerFirmware = const Value.absent(),
    required DateTime startedAt,
    this.startGpsTimeMs = const Value.absent(),
    this.stoppedAt = const Value.absent(),
    this.stopGpsTimeMs = const Value.absent(),
    required String status,
    this.scanPlatform = const Value.absent(),
    this.cameraHeightM = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       parcelId = Value(parcelId),
       sessionType = Value(sessionType),
       visitKind = Value(visitKind),
       methodologyVersion = Value(methodologyVersion),
       appVersion = Value(appVersion),
       startedAt = Value(startedAt),
       status = Value(status);
  static Insertable<SessionRow> custom({
    Expression<String>? id,
    Expression<String>? parcelId,
    Expression<String>? taskId,
    Expression<String>? sessionType,
    Expression<String>? visitKind,
    Expression<String>? season,
    Expression<String>? operatorId,
    Expression<String>? methodologyVersion,
    Expression<String>? appVersion,
    Expression<String>? loggerName,
    Expression<String>? loggerFirmware,
    Expression<DateTime>? startedAt,
    Expression<int>? startGpsTimeMs,
    Expression<DateTime>? stoppedAt,
    Expression<int>? stopGpsTimeMs,
    Expression<String>? status,
    Expression<String>? scanPlatform,
    Expression<double>? cameraHeightM,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (parcelId != null) 'parcel_id': parcelId,
      if (taskId != null) 'task_id': taskId,
      if (sessionType != null) 'session_type': sessionType,
      if (visitKind != null) 'visit_kind': visitKind,
      if (season != null) 'season': season,
      if (operatorId != null) 'operator_id': operatorId,
      if (methodologyVersion != null) 'methodology_version': methodologyVersion,
      if (appVersion != null) 'app_version': appVersion,
      if (loggerName != null) 'logger_name': loggerName,
      if (loggerFirmware != null) 'logger_firmware': loggerFirmware,
      if (startedAt != null) 'started_at': startedAt,
      if (startGpsTimeMs != null) 'start_gps_time_ms': startGpsTimeMs,
      if (stoppedAt != null) 'stopped_at': stoppedAt,
      if (stopGpsTimeMs != null) 'stop_gps_time_ms': stopGpsTimeMs,
      if (status != null) 'status': status,
      if (scanPlatform != null) 'scan_platform': scanPlatform,
      if (cameraHeightM != null) 'camera_height_m': cameraHeightM,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SessionsCompanion copyWith({
    Value<String>? id,
    Value<String>? parcelId,
    Value<String?>? taskId,
    Value<String>? sessionType,
    Value<String>? visitKind,
    Value<String?>? season,
    Value<String?>? operatorId,
    Value<String>? methodologyVersion,
    Value<String>? appVersion,
    Value<String?>? loggerName,
    Value<String?>? loggerFirmware,
    Value<DateTime>? startedAt,
    Value<int?>? startGpsTimeMs,
    Value<DateTime?>? stoppedAt,
    Value<int?>? stopGpsTimeMs,
    Value<String>? status,
    Value<String?>? scanPlatform,
    Value<double?>? cameraHeightM,
    Value<int>? rowid,
  }) {
    return SessionsCompanion(
      id: id ?? this.id,
      parcelId: parcelId ?? this.parcelId,
      taskId: taskId ?? this.taskId,
      sessionType: sessionType ?? this.sessionType,
      visitKind: visitKind ?? this.visitKind,
      season: season ?? this.season,
      operatorId: operatorId ?? this.operatorId,
      methodologyVersion: methodologyVersion ?? this.methodologyVersion,
      appVersion: appVersion ?? this.appVersion,
      loggerName: loggerName ?? this.loggerName,
      loggerFirmware: loggerFirmware ?? this.loggerFirmware,
      startedAt: startedAt ?? this.startedAt,
      startGpsTimeMs: startGpsTimeMs ?? this.startGpsTimeMs,
      stoppedAt: stoppedAt ?? this.stoppedAt,
      stopGpsTimeMs: stopGpsTimeMs ?? this.stopGpsTimeMs,
      status: status ?? this.status,
      scanPlatform: scanPlatform ?? this.scanPlatform,
      cameraHeightM: cameraHeightM ?? this.cameraHeightM,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (parcelId.present) {
      map['parcel_id'] = Variable<String>(parcelId.value);
    }
    if (taskId.present) {
      map['task_id'] = Variable<String>(taskId.value);
    }
    if (sessionType.present) {
      map['session_type'] = Variable<String>(sessionType.value);
    }
    if (visitKind.present) {
      map['visit_kind'] = Variable<String>(visitKind.value);
    }
    if (season.present) {
      map['season'] = Variable<String>(season.value);
    }
    if (operatorId.present) {
      map['operator_id'] = Variable<String>(operatorId.value);
    }
    if (methodologyVersion.present) {
      map['methodology_version'] = Variable<String>(methodologyVersion.value);
    }
    if (appVersion.present) {
      map['app_version'] = Variable<String>(appVersion.value);
    }
    if (loggerName.present) {
      map['logger_name'] = Variable<String>(loggerName.value);
    }
    if (loggerFirmware.present) {
      map['logger_firmware'] = Variable<String>(loggerFirmware.value);
    }
    if (startedAt.present) {
      map['started_at'] = Variable<DateTime>(startedAt.value);
    }
    if (startGpsTimeMs.present) {
      map['start_gps_time_ms'] = Variable<int>(startGpsTimeMs.value);
    }
    if (stoppedAt.present) {
      map['stopped_at'] = Variable<DateTime>(stoppedAt.value);
    }
    if (stopGpsTimeMs.present) {
      map['stop_gps_time_ms'] = Variable<int>(stopGpsTimeMs.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (scanPlatform.present) {
      map['scan_platform'] = Variable<String>(scanPlatform.value);
    }
    if (cameraHeightM.present) {
      map['camera_height_m'] = Variable<double>(cameraHeightM.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SessionsCompanion(')
          ..write('id: $id, ')
          ..write('parcelId: $parcelId, ')
          ..write('taskId: $taskId, ')
          ..write('sessionType: $sessionType, ')
          ..write('visitKind: $visitKind, ')
          ..write('season: $season, ')
          ..write('operatorId: $operatorId, ')
          ..write('methodologyVersion: $methodologyVersion, ')
          ..write('appVersion: $appVersion, ')
          ..write('loggerName: $loggerName, ')
          ..write('loggerFirmware: $loggerFirmware, ')
          ..write('startedAt: $startedAt, ')
          ..write('startGpsTimeMs: $startGpsTimeMs, ')
          ..write('stoppedAt: $stoppedAt, ')
          ..write('stopGpsTimeMs: $stopGpsTimeMs, ')
          ..write('status: $status, ')
          ..write('scanPlatform: $scanPlatform, ')
          ..write('cameraHeightM: $cameraHeightM, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SessionEventsTable extends SessionEvents
    with TableInfo<$SessionEventsTable, SessionEventRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SessionEventsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES sessions (id)',
    ),
  );
  static const VerificationMeta _eventTypeMeta = const VerificationMeta(
    'eventType',
  );
  @override
  late final GeneratedColumn<String> eventType = GeneratedColumn<String>(
    'event_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadMeta = const VerificationMeta(
    'payload',
  );
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
    'payload',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataJsonMeta = const VerificationMeta(
    'dataJson',
  );
  @override
  late final GeneratedColumn<String> dataJson = GeneratedColumn<String>(
    'data_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _phoneTimeMeta = const VerificationMeta(
    'phoneTime',
  );
  @override
  late final GeneratedColumn<DateTime> phoneTime = GeneratedColumn<DateTime>(
    'phone_time',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _gpsTimeMsMeta = const VerificationMeta(
    'gpsTimeMs',
  );
  @override
  late final GeneratedColumn<int> gpsTimeMs = GeneratedColumn<int>(
    'gps_time_ms',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _timeSourceMeta = const VerificationMeta(
    'timeSource',
  );
  @override
  late final GeneratedColumn<String> timeSource = GeneratedColumn<String>(
    'time_source',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _loggerResultMeta = const VerificationMeta(
    'loggerResult',
  );
  @override
  late final GeneratedColumn<String> loggerResult = GeneratedColumn<String>(
    'logger_result',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    sessionId,
    eventType,
    payload,
    dataJson,
    phoneTime,
    gpsTimeMs,
    timeSource,
    loggerResult,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'session_events';
  @override
  VerificationContext validateIntegrity(
    Insertable<SessionEventRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('event_type')) {
      context.handle(
        _eventTypeMeta,
        eventType.isAcceptableOrUnknown(data['event_type']!, _eventTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_eventTypeMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(
        _payloadMeta,
        payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta),
      );
    } else if (isInserting) {
      context.missing(_payloadMeta);
    }
    if (data.containsKey('data_json')) {
      context.handle(
        _dataJsonMeta,
        dataJson.isAcceptableOrUnknown(data['data_json']!, _dataJsonMeta),
      );
    }
    if (data.containsKey('phone_time')) {
      context.handle(
        _phoneTimeMeta,
        phoneTime.isAcceptableOrUnknown(data['phone_time']!, _phoneTimeMeta),
      );
    } else if (isInserting) {
      context.missing(_phoneTimeMeta);
    }
    if (data.containsKey('gps_time_ms')) {
      context.handle(
        _gpsTimeMsMeta,
        gpsTimeMs.isAcceptableOrUnknown(data['gps_time_ms']!, _gpsTimeMsMeta),
      );
    } else if (isInserting) {
      context.missing(_gpsTimeMsMeta);
    }
    if (data.containsKey('time_source')) {
      context.handle(
        _timeSourceMeta,
        timeSource.isAcceptableOrUnknown(data['time_source']!, _timeSourceMeta),
      );
    } else if (isInserting) {
      context.missing(_timeSourceMeta);
    }
    if (data.containsKey('logger_result')) {
      context.handle(
        _loggerResultMeta,
        loggerResult.isAcceptableOrUnknown(
          data['logger_result']!,
          _loggerResultMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_loggerResultMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SessionEventRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SessionEventRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      )!,
      eventType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}event_type'],
      )!,
      payload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload'],
      )!,
      dataJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}data_json'],
      ),
      phoneTime: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}phone_time'],
      )!,
      gpsTimeMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}gps_time_ms'],
      )!,
      timeSource: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}time_source'],
      )!,
      loggerResult: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}logger_result'],
      )!,
    );
  }

  @override
  $SessionEventsTable createAlias(String alias) {
    return $SessionEventsTable(attachedDatabase, alias);
  }
}

class SessionEventRow extends DataClass implements Insertable<SessionEventRow> {
  final String id;
  final String sessionId;

  /// `session_start`, `session_stop`, `corner`, `qr_sync`,
  /// `boundary_corners`, `coverage`, `route`, `route_progress`, the legal
  /// field records `field_notice_*`, `visit_blocked`, `boundary_pointer`
  /// (docs/arayuzler.md, "Saha olayları").
  final String eventType;
  final String payload;

  /// Structured details as a JSON object (`session_event.data`, schema 4):
  /// corner position and quality, boundary edits, coverage. Null when none.
  final String? dataJson;
  final DateTime phoneTime;
  final int gpsTimeMs;

  /// `gps` or `phone` (see TimeSource).
  final String timeSource;

  /// Logger's answer (CommandResult name).
  final String loggerResult;
  const SessionEventRow({
    required this.id,
    required this.sessionId,
    required this.eventType,
    required this.payload,
    this.dataJson,
    required this.phoneTime,
    required this.gpsTimeMs,
    required this.timeSource,
    required this.loggerResult,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['session_id'] = Variable<String>(sessionId);
    map['event_type'] = Variable<String>(eventType);
    map['payload'] = Variable<String>(payload);
    if (!nullToAbsent || dataJson != null) {
      map['data_json'] = Variable<String>(dataJson);
    }
    map['phone_time'] = Variable<DateTime>(phoneTime);
    map['gps_time_ms'] = Variable<int>(gpsTimeMs);
    map['time_source'] = Variable<String>(timeSource);
    map['logger_result'] = Variable<String>(loggerResult);
    return map;
  }

  SessionEventsCompanion toCompanion(bool nullToAbsent) {
    return SessionEventsCompanion(
      id: Value(id),
      sessionId: Value(sessionId),
      eventType: Value(eventType),
      payload: Value(payload),
      dataJson: dataJson == null && nullToAbsent
          ? const Value.absent()
          : Value(dataJson),
      phoneTime: Value(phoneTime),
      gpsTimeMs: Value(gpsTimeMs),
      timeSource: Value(timeSource),
      loggerResult: Value(loggerResult),
    );
  }

  factory SessionEventRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SessionEventRow(
      id: serializer.fromJson<String>(json['id']),
      sessionId: serializer.fromJson<String>(json['sessionId']),
      eventType: serializer.fromJson<String>(json['eventType']),
      payload: serializer.fromJson<String>(json['payload']),
      dataJson: serializer.fromJson<String?>(json['dataJson']),
      phoneTime: serializer.fromJson<DateTime>(json['phoneTime']),
      gpsTimeMs: serializer.fromJson<int>(json['gpsTimeMs']),
      timeSource: serializer.fromJson<String>(json['timeSource']),
      loggerResult: serializer.fromJson<String>(json['loggerResult']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'sessionId': serializer.toJson<String>(sessionId),
      'eventType': serializer.toJson<String>(eventType),
      'payload': serializer.toJson<String>(payload),
      'dataJson': serializer.toJson<String?>(dataJson),
      'phoneTime': serializer.toJson<DateTime>(phoneTime),
      'gpsTimeMs': serializer.toJson<int>(gpsTimeMs),
      'timeSource': serializer.toJson<String>(timeSource),
      'loggerResult': serializer.toJson<String>(loggerResult),
    };
  }

  SessionEventRow copyWith({
    String? id,
    String? sessionId,
    String? eventType,
    String? payload,
    Value<String?> dataJson = const Value.absent(),
    DateTime? phoneTime,
    int? gpsTimeMs,
    String? timeSource,
    String? loggerResult,
  }) => SessionEventRow(
    id: id ?? this.id,
    sessionId: sessionId ?? this.sessionId,
    eventType: eventType ?? this.eventType,
    payload: payload ?? this.payload,
    dataJson: dataJson.present ? dataJson.value : this.dataJson,
    phoneTime: phoneTime ?? this.phoneTime,
    gpsTimeMs: gpsTimeMs ?? this.gpsTimeMs,
    timeSource: timeSource ?? this.timeSource,
    loggerResult: loggerResult ?? this.loggerResult,
  );
  SessionEventRow copyWithCompanion(SessionEventsCompanion data) {
    return SessionEventRow(
      id: data.id.present ? data.id.value : this.id,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      eventType: data.eventType.present ? data.eventType.value : this.eventType,
      payload: data.payload.present ? data.payload.value : this.payload,
      dataJson: data.dataJson.present ? data.dataJson.value : this.dataJson,
      phoneTime: data.phoneTime.present ? data.phoneTime.value : this.phoneTime,
      gpsTimeMs: data.gpsTimeMs.present ? data.gpsTimeMs.value : this.gpsTimeMs,
      timeSource: data.timeSource.present
          ? data.timeSource.value
          : this.timeSource,
      loggerResult: data.loggerResult.present
          ? data.loggerResult.value
          : this.loggerResult,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SessionEventRow(')
          ..write('id: $id, ')
          ..write('sessionId: $sessionId, ')
          ..write('eventType: $eventType, ')
          ..write('payload: $payload, ')
          ..write('dataJson: $dataJson, ')
          ..write('phoneTime: $phoneTime, ')
          ..write('gpsTimeMs: $gpsTimeMs, ')
          ..write('timeSource: $timeSource, ')
          ..write('loggerResult: $loggerResult')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    sessionId,
    eventType,
    payload,
    dataJson,
    phoneTime,
    gpsTimeMs,
    timeSource,
    loggerResult,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SessionEventRow &&
          other.id == this.id &&
          other.sessionId == this.sessionId &&
          other.eventType == this.eventType &&
          other.payload == this.payload &&
          other.dataJson == this.dataJson &&
          other.phoneTime == this.phoneTime &&
          other.gpsTimeMs == this.gpsTimeMs &&
          other.timeSource == this.timeSource &&
          other.loggerResult == this.loggerResult);
}

class SessionEventsCompanion extends UpdateCompanion<SessionEventRow> {
  final Value<String> id;
  final Value<String> sessionId;
  final Value<String> eventType;
  final Value<String> payload;
  final Value<String?> dataJson;
  final Value<DateTime> phoneTime;
  final Value<int> gpsTimeMs;
  final Value<String> timeSource;
  final Value<String> loggerResult;
  final Value<int> rowid;
  const SessionEventsCompanion({
    this.id = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.eventType = const Value.absent(),
    this.payload = const Value.absent(),
    this.dataJson = const Value.absent(),
    this.phoneTime = const Value.absent(),
    this.gpsTimeMs = const Value.absent(),
    this.timeSource = const Value.absent(),
    this.loggerResult = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SessionEventsCompanion.insert({
    required String id,
    required String sessionId,
    required String eventType,
    required String payload,
    this.dataJson = const Value.absent(),
    required DateTime phoneTime,
    required int gpsTimeMs,
    required String timeSource,
    required String loggerResult,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       sessionId = Value(sessionId),
       eventType = Value(eventType),
       payload = Value(payload),
       phoneTime = Value(phoneTime),
       gpsTimeMs = Value(gpsTimeMs),
       timeSource = Value(timeSource),
       loggerResult = Value(loggerResult);
  static Insertable<SessionEventRow> custom({
    Expression<String>? id,
    Expression<String>? sessionId,
    Expression<String>? eventType,
    Expression<String>? payload,
    Expression<String>? dataJson,
    Expression<DateTime>? phoneTime,
    Expression<int>? gpsTimeMs,
    Expression<String>? timeSource,
    Expression<String>? loggerResult,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sessionId != null) 'session_id': sessionId,
      if (eventType != null) 'event_type': eventType,
      if (payload != null) 'payload': payload,
      if (dataJson != null) 'data_json': dataJson,
      if (phoneTime != null) 'phone_time': phoneTime,
      if (gpsTimeMs != null) 'gps_time_ms': gpsTimeMs,
      if (timeSource != null) 'time_source': timeSource,
      if (loggerResult != null) 'logger_result': loggerResult,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SessionEventsCompanion copyWith({
    Value<String>? id,
    Value<String>? sessionId,
    Value<String>? eventType,
    Value<String>? payload,
    Value<String?>? dataJson,
    Value<DateTime>? phoneTime,
    Value<int>? gpsTimeMs,
    Value<String>? timeSource,
    Value<String>? loggerResult,
    Value<int>? rowid,
  }) {
    return SessionEventsCompanion(
      id: id ?? this.id,
      sessionId: sessionId ?? this.sessionId,
      eventType: eventType ?? this.eventType,
      payload: payload ?? this.payload,
      dataJson: dataJson ?? this.dataJson,
      phoneTime: phoneTime ?? this.phoneTime,
      gpsTimeMs: gpsTimeMs ?? this.gpsTimeMs,
      timeSource: timeSource ?? this.timeSource,
      loggerResult: loggerResult ?? this.loggerResult,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (eventType.present) {
      map['event_type'] = Variable<String>(eventType.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    if (dataJson.present) {
      map['data_json'] = Variable<String>(dataJson.value);
    }
    if (phoneTime.present) {
      map['phone_time'] = Variable<DateTime>(phoneTime.value);
    }
    if (gpsTimeMs.present) {
      map['gps_time_ms'] = Variable<int>(gpsTimeMs.value);
    }
    if (timeSource.present) {
      map['time_source'] = Variable<String>(timeSource.value);
    }
    if (loggerResult.present) {
      map['logger_result'] = Variable<String>(loggerResult.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SessionEventsCompanion(')
          ..write('id: $id, ')
          ..write('sessionId: $sessionId, ')
          ..write('eventType: $eventType, ')
          ..write('payload: $payload, ')
          ..write('dataJson: $dataJson, ')
          ..write('phoneTime: $phoneTime, ')
          ..write('gpsTimeMs: $gpsTimeMs, ')
          ..write('timeSource: $timeSource, ')
          ..write('loggerResult: $loggerResult, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CapturesTable extends Captures
    with TableInfo<$CapturesTable, CaptureRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CapturesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
    'sha256',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES sessions (id)',
    ),
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sensorMeta = const VerificationMeta('sensor');
  @override
  late final GeneratedColumn<String> sensor = GeneratedColumn<String>(
    'sensor',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _mediaTypeMeta = const VerificationMeta(
    'mediaType',
  );
  @override
  late final GeneratedColumn<String> mediaType = GeneratedColumn<String>(
    'media_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _byteSizeMeta = const VerificationMeta(
    'byteSize',
  );
  @override
  late final GeneratedColumn<int> byteSize = GeneratedColumn<int>(
    'byte_size',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _localPathMeta = const VerificationMeta(
    'localPath',
  );
  @override
  late final GeneratedColumn<String> localPath = GeneratedColumn<String>(
    'local_path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _subjectTypeMeta = const VerificationMeta(
    'subjectType',
  );
  @override
  late final GeneratedColumn<String> subjectType = GeneratedColumn<String>(
    'subject_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _subjectIdMeta = const VerificationMeta(
    'subjectId',
  );
  @override
  late final GeneratedColumn<String> subjectId = GeneratedColumn<String>(
    'subject_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _slotCodeMeta = const VerificationMeta(
    'slotCode',
  );
  @override
  late final GeneratedColumn<String> slotCode = GeneratedColumn<String>(
    'slot_code',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _shotCodeMeta = const VerificationMeta(
    'shotCode',
  );
  @override
  late final GeneratedColumn<String> shotCode = GeneratedColumn<String>(
    'shot_code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _capturedAtMeta = const VerificationMeta(
    'capturedAt',
  );
  @override
  late final GeneratedColumn<DateTime> capturedAt = GeneratedColumn<DateTime>(
    'captured_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _gpsTimeMsMeta = const VerificationMeta(
    'gpsTimeMs',
  );
  @override
  late final GeneratedColumn<int> gpsTimeMs = GeneratedColumn<int>(
    'gps_time_ms',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _timeSourceMeta = const VerificationMeta(
    'timeSource',
  );
  @override
  late final GeneratedColumn<String> timeSource = GeneratedColumn<String>(
    'time_source',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _qcVerdictMeta = const VerificationMeta(
    'qcVerdict',
  );
  @override
  late final GeneratedColumn<String> qcVerdict = GeneratedColumn<String>(
    'qc_verdict',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcVersionMeta = const VerificationMeta(
    'qcVersion',
  );
  @override
  late final GeneratedColumn<String> qcVersion = GeneratedColumn<String>(
    'qc_version',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcSharpnessMeta = const VerificationMeta(
    'qcSharpness',
  );
  @override
  late final GeneratedColumn<double> qcSharpness = GeneratedColumn<double>(
    'qc_sharpness',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcBrightnessMeta = const VerificationMeta(
    'qcBrightness',
  );
  @override
  late final GeneratedColumn<double> qcBrightness = GeneratedColumn<double>(
    'qc_brightness',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcDarkRatioMeta = const VerificationMeta(
    'qcDarkRatio',
  );
  @override
  late final GeneratedColumn<double> qcDarkRatio = GeneratedColumn<double>(
    'qc_dark_ratio',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcBrightRatioMeta = const VerificationMeta(
    'qcBrightRatio',
  );
  @override
  late final GeneratedColumn<double> qcBrightRatio = GeneratedColumn<double>(
    'qc_bright_ratio',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qcFindingsMeta = const VerificationMeta(
    'qcFindings',
  );
  @override
  late final GeneratedColumn<String> qcFindings = GeneratedColumn<String>(
    'qc_findings',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    sha256,
    sessionId,
    kind,
    sensor,
    mediaType,
    byteSize,
    localPath,
    subjectType,
    subjectId,
    slotCode,
    shotCode,
    capturedAt,
    gpsTimeMs,
    timeSource,
    qcVerdict,
    qcVersion,
    qcSharpness,
    qcBrightness,
    qcDarkRatio,
    qcBrightRatio,
    qcFindings,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'captures';
  @override
  VerificationContext validateIntegrity(
    Insertable<CaptureRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('sha256')) {
      context.handle(
        _sha256Meta,
        sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta),
      );
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('sensor')) {
      context.handle(
        _sensorMeta,
        sensor.isAcceptableOrUnknown(data['sensor']!, _sensorMeta),
      );
    } else if (isInserting) {
      context.missing(_sensorMeta);
    }
    if (data.containsKey('media_type')) {
      context.handle(
        _mediaTypeMeta,
        mediaType.isAcceptableOrUnknown(data['media_type']!, _mediaTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_mediaTypeMeta);
    }
    if (data.containsKey('byte_size')) {
      context.handle(
        _byteSizeMeta,
        byteSize.isAcceptableOrUnknown(data['byte_size']!, _byteSizeMeta),
      );
    } else if (isInserting) {
      context.missing(_byteSizeMeta);
    }
    if (data.containsKey('local_path')) {
      context.handle(
        _localPathMeta,
        localPath.isAcceptableOrUnknown(data['local_path']!, _localPathMeta),
      );
    } else if (isInserting) {
      context.missing(_localPathMeta);
    }
    if (data.containsKey('subject_type')) {
      context.handle(
        _subjectTypeMeta,
        subjectType.isAcceptableOrUnknown(
          data['subject_type']!,
          _subjectTypeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_subjectTypeMeta);
    }
    if (data.containsKey('subject_id')) {
      context.handle(
        _subjectIdMeta,
        subjectId.isAcceptableOrUnknown(data['subject_id']!, _subjectIdMeta),
      );
    } else if (isInserting) {
      context.missing(_subjectIdMeta);
    }
    if (data.containsKey('slot_code')) {
      context.handle(
        _slotCodeMeta,
        slotCode.isAcceptableOrUnknown(data['slot_code']!, _slotCodeMeta),
      );
    }
    if (data.containsKey('shot_code')) {
      context.handle(
        _shotCodeMeta,
        shotCode.isAcceptableOrUnknown(data['shot_code']!, _shotCodeMeta),
      );
    } else if (isInserting) {
      context.missing(_shotCodeMeta);
    }
    if (data.containsKey('captured_at')) {
      context.handle(
        _capturedAtMeta,
        capturedAt.isAcceptableOrUnknown(data['captured_at']!, _capturedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_capturedAtMeta);
    }
    if (data.containsKey('gps_time_ms')) {
      context.handle(
        _gpsTimeMsMeta,
        gpsTimeMs.isAcceptableOrUnknown(data['gps_time_ms']!, _gpsTimeMsMeta),
      );
    } else if (isInserting) {
      context.missing(_gpsTimeMsMeta);
    }
    if (data.containsKey('time_source')) {
      context.handle(
        _timeSourceMeta,
        timeSource.isAcceptableOrUnknown(data['time_source']!, _timeSourceMeta),
      );
    } else if (isInserting) {
      context.missing(_timeSourceMeta);
    }
    if (data.containsKey('qc_verdict')) {
      context.handle(
        _qcVerdictMeta,
        qcVerdict.isAcceptableOrUnknown(data['qc_verdict']!, _qcVerdictMeta),
      );
    }
    if (data.containsKey('qc_version')) {
      context.handle(
        _qcVersionMeta,
        qcVersion.isAcceptableOrUnknown(data['qc_version']!, _qcVersionMeta),
      );
    }
    if (data.containsKey('qc_sharpness')) {
      context.handle(
        _qcSharpnessMeta,
        qcSharpness.isAcceptableOrUnknown(
          data['qc_sharpness']!,
          _qcSharpnessMeta,
        ),
      );
    }
    if (data.containsKey('qc_brightness')) {
      context.handle(
        _qcBrightnessMeta,
        qcBrightness.isAcceptableOrUnknown(
          data['qc_brightness']!,
          _qcBrightnessMeta,
        ),
      );
    }
    if (data.containsKey('qc_dark_ratio')) {
      context.handle(
        _qcDarkRatioMeta,
        qcDarkRatio.isAcceptableOrUnknown(
          data['qc_dark_ratio']!,
          _qcDarkRatioMeta,
        ),
      );
    }
    if (data.containsKey('qc_bright_ratio')) {
      context.handle(
        _qcBrightRatioMeta,
        qcBrightRatio.isAcceptableOrUnknown(
          data['qc_bright_ratio']!,
          _qcBrightRatioMeta,
        ),
      );
    }
    if (data.containsKey('qc_findings')) {
      context.handle(
        _qcFindingsMeta,
        qcFindings.isAcceptableOrUnknown(data['qc_findings']!, _qcFindingsMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {sha256};
  @override
  CaptureRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CaptureRow(
      sha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sha256'],
      )!,
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      sensor: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sensor'],
      )!,
      mediaType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}media_type'],
      )!,
      byteSize: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}byte_size'],
      )!,
      localPath: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}local_path'],
      )!,
      subjectType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}subject_type'],
      )!,
      subjectId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}subject_id'],
      )!,
      slotCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}slot_code'],
      ),
      shotCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}shot_code'],
      )!,
      capturedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}captured_at'],
      )!,
      gpsTimeMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}gps_time_ms'],
      )!,
      timeSource: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}time_source'],
      )!,
      qcVerdict: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}qc_verdict'],
      ),
      qcVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}qc_version'],
      ),
      qcSharpness: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}qc_sharpness'],
      ),
      qcBrightness: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}qc_brightness'],
      ),
      qcDarkRatio: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}qc_dark_ratio'],
      ),
      qcBrightRatio: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}qc_bright_ratio'],
      ),
      qcFindings: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}qc_findings'],
      ),
    );
  }

  @override
  $CapturesTable createAlias(String alias) {
    return $CapturesTable(attachedDatabase, alias);
  }
}

class CaptureRow extends DataClass implements Insertable<CaptureRow> {
  /// SHA-256 of the file bytes (hex), computed when the photo is taken.
  final String sha256;
  final String sessionId;

  /// `closeup_photo`, `audio_note`, `boundary_photo`, `verification_photo`,
  /// `blocked_visit_photo`.
  final String kind;

  /// `phone_camera`.
  final String sensor;
  final String mediaType;
  final int byteSize;
  final String localPath;

  /// Subject: `tree` and the tree id; slot code kept for the field crew.
  /// Also `slot`, `corner` (its event) and `event` (a `visit_blocked`).
  final String subjectType;
  final String subjectId;
  final String? slotCode;

  /// Which "shoot like this" slot the photo fills (e.g. `trunk`).
  final String shotCode;
  final DateTime capturedAt;
  final int gpsTimeMs;

  /// `gps` or `phone`: whether [gpsTimeMs] came from the logger's GPS time
  /// or from the phone clock alone.
  final String timeSource;

  /// On-device quality check (schema 2; null on rows from schema 1).
  /// `accept` or `warn`; rejected photos are never stored.
  final String? qcVerdict;

  /// Version of the check and its thresholds (`photo-qc-v1`).
  final String? qcVersion;

  /// Variance of the Laplacian, mean luminance (0–255) and clipped pixel
  /// shares (0–1) on the downscaled photo.
  final double? qcSharpness;
  final double? qcBrightness;
  final double? qcDarkRatio;
  final double? qcBrightRatio;

  /// Warnings the crew accepted, e.g. `blurry:warn`; empty when none.
  final String? qcFindings;
  const CaptureRow({
    required this.sha256,
    required this.sessionId,
    required this.kind,
    required this.sensor,
    required this.mediaType,
    required this.byteSize,
    required this.localPath,
    required this.subjectType,
    required this.subjectId,
    this.slotCode,
    required this.shotCode,
    required this.capturedAt,
    required this.gpsTimeMs,
    required this.timeSource,
    this.qcVerdict,
    this.qcVersion,
    this.qcSharpness,
    this.qcBrightness,
    this.qcDarkRatio,
    this.qcBrightRatio,
    this.qcFindings,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['sha256'] = Variable<String>(sha256);
    map['session_id'] = Variable<String>(sessionId);
    map['kind'] = Variable<String>(kind);
    map['sensor'] = Variable<String>(sensor);
    map['media_type'] = Variable<String>(mediaType);
    map['byte_size'] = Variable<int>(byteSize);
    map['local_path'] = Variable<String>(localPath);
    map['subject_type'] = Variable<String>(subjectType);
    map['subject_id'] = Variable<String>(subjectId);
    if (!nullToAbsent || slotCode != null) {
      map['slot_code'] = Variable<String>(slotCode);
    }
    map['shot_code'] = Variable<String>(shotCode);
    map['captured_at'] = Variable<DateTime>(capturedAt);
    map['gps_time_ms'] = Variable<int>(gpsTimeMs);
    map['time_source'] = Variable<String>(timeSource);
    if (!nullToAbsent || qcVerdict != null) {
      map['qc_verdict'] = Variable<String>(qcVerdict);
    }
    if (!nullToAbsent || qcVersion != null) {
      map['qc_version'] = Variable<String>(qcVersion);
    }
    if (!nullToAbsent || qcSharpness != null) {
      map['qc_sharpness'] = Variable<double>(qcSharpness);
    }
    if (!nullToAbsent || qcBrightness != null) {
      map['qc_brightness'] = Variable<double>(qcBrightness);
    }
    if (!nullToAbsent || qcDarkRatio != null) {
      map['qc_dark_ratio'] = Variable<double>(qcDarkRatio);
    }
    if (!nullToAbsent || qcBrightRatio != null) {
      map['qc_bright_ratio'] = Variable<double>(qcBrightRatio);
    }
    if (!nullToAbsent || qcFindings != null) {
      map['qc_findings'] = Variable<String>(qcFindings);
    }
    return map;
  }

  CapturesCompanion toCompanion(bool nullToAbsent) {
    return CapturesCompanion(
      sha256: Value(sha256),
      sessionId: Value(sessionId),
      kind: Value(kind),
      sensor: Value(sensor),
      mediaType: Value(mediaType),
      byteSize: Value(byteSize),
      localPath: Value(localPath),
      subjectType: Value(subjectType),
      subjectId: Value(subjectId),
      slotCode: slotCode == null && nullToAbsent
          ? const Value.absent()
          : Value(slotCode),
      shotCode: Value(shotCode),
      capturedAt: Value(capturedAt),
      gpsTimeMs: Value(gpsTimeMs),
      timeSource: Value(timeSource),
      qcVerdict: qcVerdict == null && nullToAbsent
          ? const Value.absent()
          : Value(qcVerdict),
      qcVersion: qcVersion == null && nullToAbsent
          ? const Value.absent()
          : Value(qcVersion),
      qcSharpness: qcSharpness == null && nullToAbsent
          ? const Value.absent()
          : Value(qcSharpness),
      qcBrightness: qcBrightness == null && nullToAbsent
          ? const Value.absent()
          : Value(qcBrightness),
      qcDarkRatio: qcDarkRatio == null && nullToAbsent
          ? const Value.absent()
          : Value(qcDarkRatio),
      qcBrightRatio: qcBrightRatio == null && nullToAbsent
          ? const Value.absent()
          : Value(qcBrightRatio),
      qcFindings: qcFindings == null && nullToAbsent
          ? const Value.absent()
          : Value(qcFindings),
    );
  }

  factory CaptureRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CaptureRow(
      sha256: serializer.fromJson<String>(json['sha256']),
      sessionId: serializer.fromJson<String>(json['sessionId']),
      kind: serializer.fromJson<String>(json['kind']),
      sensor: serializer.fromJson<String>(json['sensor']),
      mediaType: serializer.fromJson<String>(json['mediaType']),
      byteSize: serializer.fromJson<int>(json['byteSize']),
      localPath: serializer.fromJson<String>(json['localPath']),
      subjectType: serializer.fromJson<String>(json['subjectType']),
      subjectId: serializer.fromJson<String>(json['subjectId']),
      slotCode: serializer.fromJson<String?>(json['slotCode']),
      shotCode: serializer.fromJson<String>(json['shotCode']),
      capturedAt: serializer.fromJson<DateTime>(json['capturedAt']),
      gpsTimeMs: serializer.fromJson<int>(json['gpsTimeMs']),
      timeSource: serializer.fromJson<String>(json['timeSource']),
      qcVerdict: serializer.fromJson<String?>(json['qcVerdict']),
      qcVersion: serializer.fromJson<String?>(json['qcVersion']),
      qcSharpness: serializer.fromJson<double?>(json['qcSharpness']),
      qcBrightness: serializer.fromJson<double?>(json['qcBrightness']),
      qcDarkRatio: serializer.fromJson<double?>(json['qcDarkRatio']),
      qcBrightRatio: serializer.fromJson<double?>(json['qcBrightRatio']),
      qcFindings: serializer.fromJson<String?>(json['qcFindings']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'sha256': serializer.toJson<String>(sha256),
      'sessionId': serializer.toJson<String>(sessionId),
      'kind': serializer.toJson<String>(kind),
      'sensor': serializer.toJson<String>(sensor),
      'mediaType': serializer.toJson<String>(mediaType),
      'byteSize': serializer.toJson<int>(byteSize),
      'localPath': serializer.toJson<String>(localPath),
      'subjectType': serializer.toJson<String>(subjectType),
      'subjectId': serializer.toJson<String>(subjectId),
      'slotCode': serializer.toJson<String?>(slotCode),
      'shotCode': serializer.toJson<String>(shotCode),
      'capturedAt': serializer.toJson<DateTime>(capturedAt),
      'gpsTimeMs': serializer.toJson<int>(gpsTimeMs),
      'timeSource': serializer.toJson<String>(timeSource),
      'qcVerdict': serializer.toJson<String?>(qcVerdict),
      'qcVersion': serializer.toJson<String?>(qcVersion),
      'qcSharpness': serializer.toJson<double?>(qcSharpness),
      'qcBrightness': serializer.toJson<double?>(qcBrightness),
      'qcDarkRatio': serializer.toJson<double?>(qcDarkRatio),
      'qcBrightRatio': serializer.toJson<double?>(qcBrightRatio),
      'qcFindings': serializer.toJson<String?>(qcFindings),
    };
  }

  CaptureRow copyWith({
    String? sha256,
    String? sessionId,
    String? kind,
    String? sensor,
    String? mediaType,
    int? byteSize,
    String? localPath,
    String? subjectType,
    String? subjectId,
    Value<String?> slotCode = const Value.absent(),
    String? shotCode,
    DateTime? capturedAt,
    int? gpsTimeMs,
    String? timeSource,
    Value<String?> qcVerdict = const Value.absent(),
    Value<String?> qcVersion = const Value.absent(),
    Value<double?> qcSharpness = const Value.absent(),
    Value<double?> qcBrightness = const Value.absent(),
    Value<double?> qcDarkRatio = const Value.absent(),
    Value<double?> qcBrightRatio = const Value.absent(),
    Value<String?> qcFindings = const Value.absent(),
  }) => CaptureRow(
    sha256: sha256 ?? this.sha256,
    sessionId: sessionId ?? this.sessionId,
    kind: kind ?? this.kind,
    sensor: sensor ?? this.sensor,
    mediaType: mediaType ?? this.mediaType,
    byteSize: byteSize ?? this.byteSize,
    localPath: localPath ?? this.localPath,
    subjectType: subjectType ?? this.subjectType,
    subjectId: subjectId ?? this.subjectId,
    slotCode: slotCode.present ? slotCode.value : this.slotCode,
    shotCode: shotCode ?? this.shotCode,
    capturedAt: capturedAt ?? this.capturedAt,
    gpsTimeMs: gpsTimeMs ?? this.gpsTimeMs,
    timeSource: timeSource ?? this.timeSource,
    qcVerdict: qcVerdict.present ? qcVerdict.value : this.qcVerdict,
    qcVersion: qcVersion.present ? qcVersion.value : this.qcVersion,
    qcSharpness: qcSharpness.present ? qcSharpness.value : this.qcSharpness,
    qcBrightness: qcBrightness.present ? qcBrightness.value : this.qcBrightness,
    qcDarkRatio: qcDarkRatio.present ? qcDarkRatio.value : this.qcDarkRatio,
    qcBrightRatio: qcBrightRatio.present
        ? qcBrightRatio.value
        : this.qcBrightRatio,
    qcFindings: qcFindings.present ? qcFindings.value : this.qcFindings,
  );
  CaptureRow copyWithCompanion(CapturesCompanion data) {
    return CaptureRow(
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      kind: data.kind.present ? data.kind.value : this.kind,
      sensor: data.sensor.present ? data.sensor.value : this.sensor,
      mediaType: data.mediaType.present ? data.mediaType.value : this.mediaType,
      byteSize: data.byteSize.present ? data.byteSize.value : this.byteSize,
      localPath: data.localPath.present ? data.localPath.value : this.localPath,
      subjectType: data.subjectType.present
          ? data.subjectType.value
          : this.subjectType,
      subjectId: data.subjectId.present ? data.subjectId.value : this.subjectId,
      slotCode: data.slotCode.present ? data.slotCode.value : this.slotCode,
      shotCode: data.shotCode.present ? data.shotCode.value : this.shotCode,
      capturedAt: data.capturedAt.present
          ? data.capturedAt.value
          : this.capturedAt,
      gpsTimeMs: data.gpsTimeMs.present ? data.gpsTimeMs.value : this.gpsTimeMs,
      timeSource: data.timeSource.present
          ? data.timeSource.value
          : this.timeSource,
      qcVerdict: data.qcVerdict.present ? data.qcVerdict.value : this.qcVerdict,
      qcVersion: data.qcVersion.present ? data.qcVersion.value : this.qcVersion,
      qcSharpness: data.qcSharpness.present
          ? data.qcSharpness.value
          : this.qcSharpness,
      qcBrightness: data.qcBrightness.present
          ? data.qcBrightness.value
          : this.qcBrightness,
      qcDarkRatio: data.qcDarkRatio.present
          ? data.qcDarkRatio.value
          : this.qcDarkRatio,
      qcBrightRatio: data.qcBrightRatio.present
          ? data.qcBrightRatio.value
          : this.qcBrightRatio,
      qcFindings: data.qcFindings.present
          ? data.qcFindings.value
          : this.qcFindings,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CaptureRow(')
          ..write('sha256: $sha256, ')
          ..write('sessionId: $sessionId, ')
          ..write('kind: $kind, ')
          ..write('sensor: $sensor, ')
          ..write('mediaType: $mediaType, ')
          ..write('byteSize: $byteSize, ')
          ..write('localPath: $localPath, ')
          ..write('subjectType: $subjectType, ')
          ..write('subjectId: $subjectId, ')
          ..write('slotCode: $slotCode, ')
          ..write('shotCode: $shotCode, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('gpsTimeMs: $gpsTimeMs, ')
          ..write('timeSource: $timeSource, ')
          ..write('qcVerdict: $qcVerdict, ')
          ..write('qcVersion: $qcVersion, ')
          ..write('qcSharpness: $qcSharpness, ')
          ..write('qcBrightness: $qcBrightness, ')
          ..write('qcDarkRatio: $qcDarkRatio, ')
          ..write('qcBrightRatio: $qcBrightRatio, ')
          ..write('qcFindings: $qcFindings')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    sha256,
    sessionId,
    kind,
    sensor,
    mediaType,
    byteSize,
    localPath,
    subjectType,
    subjectId,
    slotCode,
    shotCode,
    capturedAt,
    gpsTimeMs,
    timeSource,
    qcVerdict,
    qcVersion,
    qcSharpness,
    qcBrightness,
    qcDarkRatio,
    qcBrightRatio,
    qcFindings,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CaptureRow &&
          other.sha256 == this.sha256 &&
          other.sessionId == this.sessionId &&
          other.kind == this.kind &&
          other.sensor == this.sensor &&
          other.mediaType == this.mediaType &&
          other.byteSize == this.byteSize &&
          other.localPath == this.localPath &&
          other.subjectType == this.subjectType &&
          other.subjectId == this.subjectId &&
          other.slotCode == this.slotCode &&
          other.shotCode == this.shotCode &&
          other.capturedAt == this.capturedAt &&
          other.gpsTimeMs == this.gpsTimeMs &&
          other.timeSource == this.timeSource &&
          other.qcVerdict == this.qcVerdict &&
          other.qcVersion == this.qcVersion &&
          other.qcSharpness == this.qcSharpness &&
          other.qcBrightness == this.qcBrightness &&
          other.qcDarkRatio == this.qcDarkRatio &&
          other.qcBrightRatio == this.qcBrightRatio &&
          other.qcFindings == this.qcFindings);
}

class CapturesCompanion extends UpdateCompanion<CaptureRow> {
  final Value<String> sha256;
  final Value<String> sessionId;
  final Value<String> kind;
  final Value<String> sensor;
  final Value<String> mediaType;
  final Value<int> byteSize;
  final Value<String> localPath;
  final Value<String> subjectType;
  final Value<String> subjectId;
  final Value<String?> slotCode;
  final Value<String> shotCode;
  final Value<DateTime> capturedAt;
  final Value<int> gpsTimeMs;
  final Value<String> timeSource;
  final Value<String?> qcVerdict;
  final Value<String?> qcVersion;
  final Value<double?> qcSharpness;
  final Value<double?> qcBrightness;
  final Value<double?> qcDarkRatio;
  final Value<double?> qcBrightRatio;
  final Value<String?> qcFindings;
  final Value<int> rowid;
  const CapturesCompanion({
    this.sha256 = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.kind = const Value.absent(),
    this.sensor = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.byteSize = const Value.absent(),
    this.localPath = const Value.absent(),
    this.subjectType = const Value.absent(),
    this.subjectId = const Value.absent(),
    this.slotCode = const Value.absent(),
    this.shotCode = const Value.absent(),
    this.capturedAt = const Value.absent(),
    this.gpsTimeMs = const Value.absent(),
    this.timeSource = const Value.absent(),
    this.qcVerdict = const Value.absent(),
    this.qcVersion = const Value.absent(),
    this.qcSharpness = const Value.absent(),
    this.qcBrightness = const Value.absent(),
    this.qcDarkRatio = const Value.absent(),
    this.qcBrightRatio = const Value.absent(),
    this.qcFindings = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CapturesCompanion.insert({
    required String sha256,
    required String sessionId,
    required String kind,
    required String sensor,
    required String mediaType,
    required int byteSize,
    required String localPath,
    required String subjectType,
    required String subjectId,
    this.slotCode = const Value.absent(),
    required String shotCode,
    required DateTime capturedAt,
    required int gpsTimeMs,
    required String timeSource,
    this.qcVerdict = const Value.absent(),
    this.qcVersion = const Value.absent(),
    this.qcSharpness = const Value.absent(),
    this.qcBrightness = const Value.absent(),
    this.qcDarkRatio = const Value.absent(),
    this.qcBrightRatio = const Value.absent(),
    this.qcFindings = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : sha256 = Value(sha256),
       sessionId = Value(sessionId),
       kind = Value(kind),
       sensor = Value(sensor),
       mediaType = Value(mediaType),
       byteSize = Value(byteSize),
       localPath = Value(localPath),
       subjectType = Value(subjectType),
       subjectId = Value(subjectId),
       shotCode = Value(shotCode),
       capturedAt = Value(capturedAt),
       gpsTimeMs = Value(gpsTimeMs),
       timeSource = Value(timeSource);
  static Insertable<CaptureRow> custom({
    Expression<String>? sha256,
    Expression<String>? sessionId,
    Expression<String>? kind,
    Expression<String>? sensor,
    Expression<String>? mediaType,
    Expression<int>? byteSize,
    Expression<String>? localPath,
    Expression<String>? subjectType,
    Expression<String>? subjectId,
    Expression<String>? slotCode,
    Expression<String>? shotCode,
    Expression<DateTime>? capturedAt,
    Expression<int>? gpsTimeMs,
    Expression<String>? timeSource,
    Expression<String>? qcVerdict,
    Expression<String>? qcVersion,
    Expression<double>? qcSharpness,
    Expression<double>? qcBrightness,
    Expression<double>? qcDarkRatio,
    Expression<double>? qcBrightRatio,
    Expression<String>? qcFindings,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (sha256 != null) 'sha256': sha256,
      if (sessionId != null) 'session_id': sessionId,
      if (kind != null) 'kind': kind,
      if (sensor != null) 'sensor': sensor,
      if (mediaType != null) 'media_type': mediaType,
      if (byteSize != null) 'byte_size': byteSize,
      if (localPath != null) 'local_path': localPath,
      if (subjectType != null) 'subject_type': subjectType,
      if (subjectId != null) 'subject_id': subjectId,
      if (slotCode != null) 'slot_code': slotCode,
      if (shotCode != null) 'shot_code': shotCode,
      if (capturedAt != null) 'captured_at': capturedAt,
      if (gpsTimeMs != null) 'gps_time_ms': gpsTimeMs,
      if (timeSource != null) 'time_source': timeSource,
      if (qcVerdict != null) 'qc_verdict': qcVerdict,
      if (qcVersion != null) 'qc_version': qcVersion,
      if (qcSharpness != null) 'qc_sharpness': qcSharpness,
      if (qcBrightness != null) 'qc_brightness': qcBrightness,
      if (qcDarkRatio != null) 'qc_dark_ratio': qcDarkRatio,
      if (qcBrightRatio != null) 'qc_bright_ratio': qcBrightRatio,
      if (qcFindings != null) 'qc_findings': qcFindings,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CapturesCompanion copyWith({
    Value<String>? sha256,
    Value<String>? sessionId,
    Value<String>? kind,
    Value<String>? sensor,
    Value<String>? mediaType,
    Value<int>? byteSize,
    Value<String>? localPath,
    Value<String>? subjectType,
    Value<String>? subjectId,
    Value<String?>? slotCode,
    Value<String>? shotCode,
    Value<DateTime>? capturedAt,
    Value<int>? gpsTimeMs,
    Value<String>? timeSource,
    Value<String?>? qcVerdict,
    Value<String?>? qcVersion,
    Value<double?>? qcSharpness,
    Value<double?>? qcBrightness,
    Value<double?>? qcDarkRatio,
    Value<double?>? qcBrightRatio,
    Value<String?>? qcFindings,
    Value<int>? rowid,
  }) {
    return CapturesCompanion(
      sha256: sha256 ?? this.sha256,
      sessionId: sessionId ?? this.sessionId,
      kind: kind ?? this.kind,
      sensor: sensor ?? this.sensor,
      mediaType: mediaType ?? this.mediaType,
      byteSize: byteSize ?? this.byteSize,
      localPath: localPath ?? this.localPath,
      subjectType: subjectType ?? this.subjectType,
      subjectId: subjectId ?? this.subjectId,
      slotCode: slotCode ?? this.slotCode,
      shotCode: shotCode ?? this.shotCode,
      capturedAt: capturedAt ?? this.capturedAt,
      gpsTimeMs: gpsTimeMs ?? this.gpsTimeMs,
      timeSource: timeSource ?? this.timeSource,
      qcVerdict: qcVerdict ?? this.qcVerdict,
      qcVersion: qcVersion ?? this.qcVersion,
      qcSharpness: qcSharpness ?? this.qcSharpness,
      qcBrightness: qcBrightness ?? this.qcBrightness,
      qcDarkRatio: qcDarkRatio ?? this.qcDarkRatio,
      qcBrightRatio: qcBrightRatio ?? this.qcBrightRatio,
      qcFindings: qcFindings ?? this.qcFindings,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (sensor.present) {
      map['sensor'] = Variable<String>(sensor.value);
    }
    if (mediaType.present) {
      map['media_type'] = Variable<String>(mediaType.value);
    }
    if (byteSize.present) {
      map['byte_size'] = Variable<int>(byteSize.value);
    }
    if (localPath.present) {
      map['local_path'] = Variable<String>(localPath.value);
    }
    if (subjectType.present) {
      map['subject_type'] = Variable<String>(subjectType.value);
    }
    if (subjectId.present) {
      map['subject_id'] = Variable<String>(subjectId.value);
    }
    if (slotCode.present) {
      map['slot_code'] = Variable<String>(slotCode.value);
    }
    if (shotCode.present) {
      map['shot_code'] = Variable<String>(shotCode.value);
    }
    if (capturedAt.present) {
      map['captured_at'] = Variable<DateTime>(capturedAt.value);
    }
    if (gpsTimeMs.present) {
      map['gps_time_ms'] = Variable<int>(gpsTimeMs.value);
    }
    if (timeSource.present) {
      map['time_source'] = Variable<String>(timeSource.value);
    }
    if (qcVerdict.present) {
      map['qc_verdict'] = Variable<String>(qcVerdict.value);
    }
    if (qcVersion.present) {
      map['qc_version'] = Variable<String>(qcVersion.value);
    }
    if (qcSharpness.present) {
      map['qc_sharpness'] = Variable<double>(qcSharpness.value);
    }
    if (qcBrightness.present) {
      map['qc_brightness'] = Variable<double>(qcBrightness.value);
    }
    if (qcDarkRatio.present) {
      map['qc_dark_ratio'] = Variable<double>(qcDarkRatio.value);
    }
    if (qcBrightRatio.present) {
      map['qc_bright_ratio'] = Variable<double>(qcBrightRatio.value);
    }
    if (qcFindings.present) {
      map['qc_findings'] = Variable<String>(qcFindings.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CapturesCompanion(')
          ..write('sha256: $sha256, ')
          ..write('sessionId: $sessionId, ')
          ..write('kind: $kind, ')
          ..write('sensor: $sensor, ')
          ..write('mediaType: $mediaType, ')
          ..write('byteSize: $byteSize, ')
          ..write('localPath: $localPath, ')
          ..write('subjectType: $subjectType, ')
          ..write('subjectId: $subjectId, ')
          ..write('slotCode: $slotCode, ')
          ..write('shotCode: $shotCode, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('gpsTimeMs: $gpsTimeMs, ')
          ..write('timeSource: $timeSource, ')
          ..write('qcVerdict: $qcVerdict, ')
          ..write('qcVersion: $qcVersion, ')
          ..write('qcSharpness: $qcSharpness, ')
          ..write('qcBrightness: $qcBrightness, ')
          ..write('qcDarkRatio: $qcDarkRatio, ')
          ..write('qcBrightRatio: $qcBrightRatio, ')
          ..write('qcFindings: $qcFindings, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MeasurementsTable extends Measurements
    with TableInfo<$MeasurementsTable, MeasurementRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MeasurementsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES sessions (id)',
    ),
  );
  static const VerificationMeta _subjectTypeMeta = const VerificationMeta(
    'subjectType',
  );
  @override
  late final GeneratedColumn<String> subjectType = GeneratedColumn<String>(
    'subject_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _subjectIdMeta = const VerificationMeta(
    'subjectId',
  );
  @override
  late final GeneratedColumn<String> subjectId = GeneratedColumn<String>(
    'subject_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _metricCodeMeta = const VerificationMeta(
    'metricCode',
  );
  @override
  late final GeneratedColumn<String> metricCode = GeneratedColumn<String>(
    'metric_code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueBooleanMeta = const VerificationMeta(
    'valueBoolean',
  );
  @override
  late final GeneratedColumn<bool> valueBoolean = GeneratedColumn<bool>(
    'value_boolean',
    aliasedName,
    true,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("value_boolean" IN (0, 1))',
    ),
  );
  static const VerificationMeta _valueNumMeta = const VerificationMeta(
    'valueNum',
  );
  @override
  late final GeneratedColumn<double> valueNum = GeneratedColumn<double>(
    'value_num',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valueTextMeta = const VerificationMeta(
    'valueText',
  );
  @override
  late final GeneratedColumn<String> valueText = GeneratedColumn<String>(
    'value_text',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _unitMeta = const VerificationMeta('unit');
  @override
  late final GeneratedColumn<String> unit = GeneratedColumn<String>(
    'unit',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _uncertaintyMeta = const VerificationMeta(
    'uncertainty',
  );
  @override
  late final GeneratedColumn<double> uncertainty = GeneratedColumn<double>(
    'uncertainty',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _methodMeta = const VerificationMeta('method');
  @override
  late final GeneratedColumn<String> method = GeneratedColumn<String>(
    'method',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _methodVersionMeta = const VerificationMeta(
    'methodVersion',
  );
  @override
  late final GeneratedColumn<String> methodVersion = GeneratedColumn<String>(
    'method_version',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
    'source',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _measuredAtMeta = const VerificationMeta(
    'measuredAt',
  );
  @override
  late final GeneratedColumn<DateTime> measuredAt = GeneratedColumn<DateTime>(
    'measured_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _evidenceJsonMeta = const VerificationMeta(
    'evidenceJson',
  );
  @override
  late final GeneratedColumn<String> evidenceJson = GeneratedColumn<String>(
    'evidence_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    sessionId,
    subjectType,
    subjectId,
    metricCode,
    valueBoolean,
    valueNum,
    valueText,
    unit,
    uncertainty,
    method,
    methodVersion,
    source,
    measuredAt,
    evidenceJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'measurements';
  @override
  VerificationContext validateIntegrity(
    Insertable<MeasurementRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('subject_type')) {
      context.handle(
        _subjectTypeMeta,
        subjectType.isAcceptableOrUnknown(
          data['subject_type']!,
          _subjectTypeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_subjectTypeMeta);
    }
    if (data.containsKey('subject_id')) {
      context.handle(
        _subjectIdMeta,
        subjectId.isAcceptableOrUnknown(data['subject_id']!, _subjectIdMeta),
      );
    } else if (isInserting) {
      context.missing(_subjectIdMeta);
    }
    if (data.containsKey('metric_code')) {
      context.handle(
        _metricCodeMeta,
        metricCode.isAcceptableOrUnknown(data['metric_code']!, _metricCodeMeta),
      );
    } else if (isInserting) {
      context.missing(_metricCodeMeta);
    }
    if (data.containsKey('value_boolean')) {
      context.handle(
        _valueBooleanMeta,
        valueBoolean.isAcceptableOrUnknown(
          data['value_boolean']!,
          _valueBooleanMeta,
        ),
      );
    }
    if (data.containsKey('value_num')) {
      context.handle(
        _valueNumMeta,
        valueNum.isAcceptableOrUnknown(data['value_num']!, _valueNumMeta),
      );
    }
    if (data.containsKey('value_text')) {
      context.handle(
        _valueTextMeta,
        valueText.isAcceptableOrUnknown(data['value_text']!, _valueTextMeta),
      );
    }
    if (data.containsKey('unit')) {
      context.handle(
        _unitMeta,
        unit.isAcceptableOrUnknown(data['unit']!, _unitMeta),
      );
    }
    if (data.containsKey('uncertainty')) {
      context.handle(
        _uncertaintyMeta,
        uncertainty.isAcceptableOrUnknown(
          data['uncertainty']!,
          _uncertaintyMeta,
        ),
      );
    }
    if (data.containsKey('method')) {
      context.handle(
        _methodMeta,
        method.isAcceptableOrUnknown(data['method']!, _methodMeta),
      );
    } else if (isInserting) {
      context.missing(_methodMeta);
    }
    if (data.containsKey('method_version')) {
      context.handle(
        _methodVersionMeta,
        methodVersion.isAcceptableOrUnknown(
          data['method_version']!,
          _methodVersionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_methodVersionMeta);
    }
    if (data.containsKey('source')) {
      context.handle(
        _sourceMeta,
        source.isAcceptableOrUnknown(data['source']!, _sourceMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceMeta);
    }
    if (data.containsKey('measured_at')) {
      context.handle(
        _measuredAtMeta,
        measuredAt.isAcceptableOrUnknown(data['measured_at']!, _measuredAtMeta),
      );
    } else if (isInserting) {
      context.missing(_measuredAtMeta);
    }
    if (data.containsKey('evidence_json')) {
      context.handle(
        _evidenceJsonMeta,
        evidenceJson.isAcceptableOrUnknown(
          data['evidence_json']!,
          _evidenceJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_evidenceJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MeasurementRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MeasurementRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      )!,
      subjectType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}subject_type'],
      )!,
      subjectId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}subject_id'],
      )!,
      metricCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}metric_code'],
      )!,
      valueBoolean: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}value_boolean'],
      ),
      valueNum: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}value_num'],
      ),
      valueText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value_text'],
      ),
      unit: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}unit'],
      ),
      uncertainty: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}uncertainty'],
      ),
      method: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}method'],
      )!,
      methodVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}method_version'],
      )!,
      source: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source'],
      )!,
      measuredAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}measured_at'],
      )!,
      evidenceJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}evidence_json'],
      )!,
    );
  }

  @override
  $MeasurementsTable createAlias(String alias) {
    return $MeasurementsTable(attachedDatabase, alias);
  }
}

class MeasurementRow extends DataClass implements Insertable<MeasurementRow> {
  final String id;
  final String sessionId;
  final String subjectType;
  final String subjectId;
  final String metricCode;

  /// Yes/no answer; `measurement.value_boolean` on the server (schema 3
  /// renamed it from `value_bool`).
  final bool? valueBoolean;
  final double? valueNum;
  final String? valueText;
  final String? unit;

  /// Numeric uncertainty; null for categorical staff answers.
  final double? uncertainty;

  /// `field_question` and the question set version.
  final String method;
  final String methodVersion;

  /// Always `staff` in this app.
  final String source;
  final DateTime measuredAt;

  /// JSON array of capture hashes shown as evidence.
  final String evidenceJson;
  const MeasurementRow({
    required this.id,
    required this.sessionId,
    required this.subjectType,
    required this.subjectId,
    required this.metricCode,
    this.valueBoolean,
    this.valueNum,
    this.valueText,
    this.unit,
    this.uncertainty,
    required this.method,
    required this.methodVersion,
    required this.source,
    required this.measuredAt,
    required this.evidenceJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['session_id'] = Variable<String>(sessionId);
    map['subject_type'] = Variable<String>(subjectType);
    map['subject_id'] = Variable<String>(subjectId);
    map['metric_code'] = Variable<String>(metricCode);
    if (!nullToAbsent || valueBoolean != null) {
      map['value_boolean'] = Variable<bool>(valueBoolean);
    }
    if (!nullToAbsent || valueNum != null) {
      map['value_num'] = Variable<double>(valueNum);
    }
    if (!nullToAbsent || valueText != null) {
      map['value_text'] = Variable<String>(valueText);
    }
    if (!nullToAbsent || unit != null) {
      map['unit'] = Variable<String>(unit);
    }
    if (!nullToAbsent || uncertainty != null) {
      map['uncertainty'] = Variable<double>(uncertainty);
    }
    map['method'] = Variable<String>(method);
    map['method_version'] = Variable<String>(methodVersion);
    map['source'] = Variable<String>(source);
    map['measured_at'] = Variable<DateTime>(measuredAt);
    map['evidence_json'] = Variable<String>(evidenceJson);
    return map;
  }

  MeasurementsCompanion toCompanion(bool nullToAbsent) {
    return MeasurementsCompanion(
      id: Value(id),
      sessionId: Value(sessionId),
      subjectType: Value(subjectType),
      subjectId: Value(subjectId),
      metricCode: Value(metricCode),
      valueBoolean: valueBoolean == null && nullToAbsent
          ? const Value.absent()
          : Value(valueBoolean),
      valueNum: valueNum == null && nullToAbsent
          ? const Value.absent()
          : Value(valueNum),
      valueText: valueText == null && nullToAbsent
          ? const Value.absent()
          : Value(valueText),
      unit: unit == null && nullToAbsent ? const Value.absent() : Value(unit),
      uncertainty: uncertainty == null && nullToAbsent
          ? const Value.absent()
          : Value(uncertainty),
      method: Value(method),
      methodVersion: Value(methodVersion),
      source: Value(source),
      measuredAt: Value(measuredAt),
      evidenceJson: Value(evidenceJson),
    );
  }

  factory MeasurementRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MeasurementRow(
      id: serializer.fromJson<String>(json['id']),
      sessionId: serializer.fromJson<String>(json['sessionId']),
      subjectType: serializer.fromJson<String>(json['subjectType']),
      subjectId: serializer.fromJson<String>(json['subjectId']),
      metricCode: serializer.fromJson<String>(json['metricCode']),
      valueBoolean: serializer.fromJson<bool?>(json['valueBoolean']),
      valueNum: serializer.fromJson<double?>(json['valueNum']),
      valueText: serializer.fromJson<String?>(json['valueText']),
      unit: serializer.fromJson<String?>(json['unit']),
      uncertainty: serializer.fromJson<double?>(json['uncertainty']),
      method: serializer.fromJson<String>(json['method']),
      methodVersion: serializer.fromJson<String>(json['methodVersion']),
      source: serializer.fromJson<String>(json['source']),
      measuredAt: serializer.fromJson<DateTime>(json['measuredAt']),
      evidenceJson: serializer.fromJson<String>(json['evidenceJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'sessionId': serializer.toJson<String>(sessionId),
      'subjectType': serializer.toJson<String>(subjectType),
      'subjectId': serializer.toJson<String>(subjectId),
      'metricCode': serializer.toJson<String>(metricCode),
      'valueBoolean': serializer.toJson<bool?>(valueBoolean),
      'valueNum': serializer.toJson<double?>(valueNum),
      'valueText': serializer.toJson<String?>(valueText),
      'unit': serializer.toJson<String?>(unit),
      'uncertainty': serializer.toJson<double?>(uncertainty),
      'method': serializer.toJson<String>(method),
      'methodVersion': serializer.toJson<String>(methodVersion),
      'source': serializer.toJson<String>(source),
      'measuredAt': serializer.toJson<DateTime>(measuredAt),
      'evidenceJson': serializer.toJson<String>(evidenceJson),
    };
  }

  MeasurementRow copyWith({
    String? id,
    String? sessionId,
    String? subjectType,
    String? subjectId,
    String? metricCode,
    Value<bool?> valueBoolean = const Value.absent(),
    Value<double?> valueNum = const Value.absent(),
    Value<String?> valueText = const Value.absent(),
    Value<String?> unit = const Value.absent(),
    Value<double?> uncertainty = const Value.absent(),
    String? method,
    String? methodVersion,
    String? source,
    DateTime? measuredAt,
    String? evidenceJson,
  }) => MeasurementRow(
    id: id ?? this.id,
    sessionId: sessionId ?? this.sessionId,
    subjectType: subjectType ?? this.subjectType,
    subjectId: subjectId ?? this.subjectId,
    metricCode: metricCode ?? this.metricCode,
    valueBoolean: valueBoolean.present ? valueBoolean.value : this.valueBoolean,
    valueNum: valueNum.present ? valueNum.value : this.valueNum,
    valueText: valueText.present ? valueText.value : this.valueText,
    unit: unit.present ? unit.value : this.unit,
    uncertainty: uncertainty.present ? uncertainty.value : this.uncertainty,
    method: method ?? this.method,
    methodVersion: methodVersion ?? this.methodVersion,
    source: source ?? this.source,
    measuredAt: measuredAt ?? this.measuredAt,
    evidenceJson: evidenceJson ?? this.evidenceJson,
  );
  MeasurementRow copyWithCompanion(MeasurementsCompanion data) {
    return MeasurementRow(
      id: data.id.present ? data.id.value : this.id,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      subjectType: data.subjectType.present
          ? data.subjectType.value
          : this.subjectType,
      subjectId: data.subjectId.present ? data.subjectId.value : this.subjectId,
      metricCode: data.metricCode.present
          ? data.metricCode.value
          : this.metricCode,
      valueBoolean: data.valueBoolean.present
          ? data.valueBoolean.value
          : this.valueBoolean,
      valueNum: data.valueNum.present ? data.valueNum.value : this.valueNum,
      valueText: data.valueText.present ? data.valueText.value : this.valueText,
      unit: data.unit.present ? data.unit.value : this.unit,
      uncertainty: data.uncertainty.present
          ? data.uncertainty.value
          : this.uncertainty,
      method: data.method.present ? data.method.value : this.method,
      methodVersion: data.methodVersion.present
          ? data.methodVersion.value
          : this.methodVersion,
      source: data.source.present ? data.source.value : this.source,
      measuredAt: data.measuredAt.present
          ? data.measuredAt.value
          : this.measuredAt,
      evidenceJson: data.evidenceJson.present
          ? data.evidenceJson.value
          : this.evidenceJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MeasurementRow(')
          ..write('id: $id, ')
          ..write('sessionId: $sessionId, ')
          ..write('subjectType: $subjectType, ')
          ..write('subjectId: $subjectId, ')
          ..write('metricCode: $metricCode, ')
          ..write('valueBoolean: $valueBoolean, ')
          ..write('valueNum: $valueNum, ')
          ..write('valueText: $valueText, ')
          ..write('unit: $unit, ')
          ..write('uncertainty: $uncertainty, ')
          ..write('method: $method, ')
          ..write('methodVersion: $methodVersion, ')
          ..write('source: $source, ')
          ..write('measuredAt: $measuredAt, ')
          ..write('evidenceJson: $evidenceJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    sessionId,
    subjectType,
    subjectId,
    metricCode,
    valueBoolean,
    valueNum,
    valueText,
    unit,
    uncertainty,
    method,
    methodVersion,
    source,
    measuredAt,
    evidenceJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MeasurementRow &&
          other.id == this.id &&
          other.sessionId == this.sessionId &&
          other.subjectType == this.subjectType &&
          other.subjectId == this.subjectId &&
          other.metricCode == this.metricCode &&
          other.valueBoolean == this.valueBoolean &&
          other.valueNum == this.valueNum &&
          other.valueText == this.valueText &&
          other.unit == this.unit &&
          other.uncertainty == this.uncertainty &&
          other.method == this.method &&
          other.methodVersion == this.methodVersion &&
          other.source == this.source &&
          other.measuredAt == this.measuredAt &&
          other.evidenceJson == this.evidenceJson);
}

class MeasurementsCompanion extends UpdateCompanion<MeasurementRow> {
  final Value<String> id;
  final Value<String> sessionId;
  final Value<String> subjectType;
  final Value<String> subjectId;
  final Value<String> metricCode;
  final Value<bool?> valueBoolean;
  final Value<double?> valueNum;
  final Value<String?> valueText;
  final Value<String?> unit;
  final Value<double?> uncertainty;
  final Value<String> method;
  final Value<String> methodVersion;
  final Value<String> source;
  final Value<DateTime> measuredAt;
  final Value<String> evidenceJson;
  final Value<int> rowid;
  const MeasurementsCompanion({
    this.id = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.subjectType = const Value.absent(),
    this.subjectId = const Value.absent(),
    this.metricCode = const Value.absent(),
    this.valueBoolean = const Value.absent(),
    this.valueNum = const Value.absent(),
    this.valueText = const Value.absent(),
    this.unit = const Value.absent(),
    this.uncertainty = const Value.absent(),
    this.method = const Value.absent(),
    this.methodVersion = const Value.absent(),
    this.source = const Value.absent(),
    this.measuredAt = const Value.absent(),
    this.evidenceJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MeasurementsCompanion.insert({
    required String id,
    required String sessionId,
    required String subjectType,
    required String subjectId,
    required String metricCode,
    this.valueBoolean = const Value.absent(),
    this.valueNum = const Value.absent(),
    this.valueText = const Value.absent(),
    this.unit = const Value.absent(),
    this.uncertainty = const Value.absent(),
    required String method,
    required String methodVersion,
    required String source,
    required DateTime measuredAt,
    required String evidenceJson,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       sessionId = Value(sessionId),
       subjectType = Value(subjectType),
       subjectId = Value(subjectId),
       metricCode = Value(metricCode),
       method = Value(method),
       methodVersion = Value(methodVersion),
       source = Value(source),
       measuredAt = Value(measuredAt),
       evidenceJson = Value(evidenceJson);
  static Insertable<MeasurementRow> custom({
    Expression<String>? id,
    Expression<String>? sessionId,
    Expression<String>? subjectType,
    Expression<String>? subjectId,
    Expression<String>? metricCode,
    Expression<bool>? valueBoolean,
    Expression<double>? valueNum,
    Expression<String>? valueText,
    Expression<String>? unit,
    Expression<double>? uncertainty,
    Expression<String>? method,
    Expression<String>? methodVersion,
    Expression<String>? source,
    Expression<DateTime>? measuredAt,
    Expression<String>? evidenceJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sessionId != null) 'session_id': sessionId,
      if (subjectType != null) 'subject_type': subjectType,
      if (subjectId != null) 'subject_id': subjectId,
      if (metricCode != null) 'metric_code': metricCode,
      if (valueBoolean != null) 'value_boolean': valueBoolean,
      if (valueNum != null) 'value_num': valueNum,
      if (valueText != null) 'value_text': valueText,
      if (unit != null) 'unit': unit,
      if (uncertainty != null) 'uncertainty': uncertainty,
      if (method != null) 'method': method,
      if (methodVersion != null) 'method_version': methodVersion,
      if (source != null) 'source': source,
      if (measuredAt != null) 'measured_at': measuredAt,
      if (evidenceJson != null) 'evidence_json': evidenceJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MeasurementsCompanion copyWith({
    Value<String>? id,
    Value<String>? sessionId,
    Value<String>? subjectType,
    Value<String>? subjectId,
    Value<String>? metricCode,
    Value<bool?>? valueBoolean,
    Value<double?>? valueNum,
    Value<String?>? valueText,
    Value<String?>? unit,
    Value<double?>? uncertainty,
    Value<String>? method,
    Value<String>? methodVersion,
    Value<String>? source,
    Value<DateTime>? measuredAt,
    Value<String>? evidenceJson,
    Value<int>? rowid,
  }) {
    return MeasurementsCompanion(
      id: id ?? this.id,
      sessionId: sessionId ?? this.sessionId,
      subjectType: subjectType ?? this.subjectType,
      subjectId: subjectId ?? this.subjectId,
      metricCode: metricCode ?? this.metricCode,
      valueBoolean: valueBoolean ?? this.valueBoolean,
      valueNum: valueNum ?? this.valueNum,
      valueText: valueText ?? this.valueText,
      unit: unit ?? this.unit,
      uncertainty: uncertainty ?? this.uncertainty,
      method: method ?? this.method,
      methodVersion: methodVersion ?? this.methodVersion,
      source: source ?? this.source,
      measuredAt: measuredAt ?? this.measuredAt,
      evidenceJson: evidenceJson ?? this.evidenceJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (subjectType.present) {
      map['subject_type'] = Variable<String>(subjectType.value);
    }
    if (subjectId.present) {
      map['subject_id'] = Variable<String>(subjectId.value);
    }
    if (metricCode.present) {
      map['metric_code'] = Variable<String>(metricCode.value);
    }
    if (valueBoolean.present) {
      map['value_boolean'] = Variable<bool>(valueBoolean.value);
    }
    if (valueNum.present) {
      map['value_num'] = Variable<double>(valueNum.value);
    }
    if (valueText.present) {
      map['value_text'] = Variable<String>(valueText.value);
    }
    if (unit.present) {
      map['unit'] = Variable<String>(unit.value);
    }
    if (uncertainty.present) {
      map['uncertainty'] = Variable<double>(uncertainty.value);
    }
    if (method.present) {
      map['method'] = Variable<String>(method.value);
    }
    if (methodVersion.present) {
      map['method_version'] = Variable<String>(methodVersion.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (measuredAt.present) {
      map['measured_at'] = Variable<DateTime>(measuredAt.value);
    }
    if (evidenceJson.present) {
      map['evidence_json'] = Variable<String>(evidenceJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MeasurementsCompanion(')
          ..write('id: $id, ')
          ..write('sessionId: $sessionId, ')
          ..write('subjectType: $subjectType, ')
          ..write('subjectId: $subjectId, ')
          ..write('metricCode: $metricCode, ')
          ..write('valueBoolean: $valueBoolean, ')
          ..write('valueNum: $valueNum, ')
          ..write('valueText: $valueText, ')
          ..write('unit: $unit, ')
          ..write('uncertainty: $uncertainty, ')
          ..write('method: $method, ')
          ..write('methodVersion: $methodVersion, ')
          ..write('source: $source, ')
          ..write('measuredAt: $measuredAt, ')
          ..write('evidenceJson: $evidenceJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OutboxEntriesTable extends OutboxEntries
    with TableInfo<$OutboxEntriesTable, OutboxEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxEntriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta(
    'entityType',
  );
  @override
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta(
    'entityId',
  );
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastAttemptAtMeta = const VerificationMeta(
    'lastAttemptAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastAttemptAt =
      GeneratedColumn<DateTime>(
        'last_attempt_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _sentAtMeta = const VerificationMeta('sentAt');
  @override
  late final GeneratedColumn<DateTime> sentAt = GeneratedColumn<DateTime>(
    'sent_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _failedAtMeta = const VerificationMeta(
    'failedAt',
  );
  @override
  late final GeneratedColumn<DateTime> failedAt = GeneratedColumn<DateTime>(
    'failed_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    entityType,
    entityId,
    createdAt,
    attempts,
    lastError,
    lastAttemptAt,
    sentAt,
    failedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox_entries';
  @override
  VerificationContext validateIntegrity(
    Insertable<OutboxEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('entity_type')) {
      context.handle(
        _entityTypeMeta,
        entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(
        _entityIdMeta,
        entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta),
      );
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('last_attempt_at')) {
      context.handle(
        _lastAttemptAtMeta,
        lastAttemptAt.isAcceptableOrUnknown(
          data['last_attempt_at']!,
          _lastAttemptAtMeta,
        ),
      );
    }
    if (data.containsKey('sent_at')) {
      context.handle(
        _sentAtMeta,
        sentAt.isAcceptableOrUnknown(data['sent_at']!, _sentAtMeta),
      );
    }
    if (data.containsKey('failed_at')) {
      context.handle(
        _failedAtMeta,
        failedAt.isAcceptableOrUnknown(data['failed_at']!, _failedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OutboxEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OutboxEntry(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      entityType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_type'],
      )!,
      entityId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      lastAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_attempt_at'],
      ),
      sentAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}sent_at'],
      ),
      failedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}failed_at'],
      ),
    );
  }

  @override
  $OutboxEntriesTable createAlias(String alias) {
    return $OutboxEntriesTable(attachedDatabase, alias);
  }
}

class OutboxEntry extends DataClass implements Insertable<OutboxEntry> {
  final int id;

  /// `session`, `session_event`, `capture`, `measurement`,
  /// `verification_result`, `parcel_route`.
  final String entityType;
  final String entityId;
  final DateTime createdAt;
  final int attempts;
  final String? lastError;
  final DateTime? lastAttemptAt;
  final DateTime? sentAt;

  /// Set when the server refused the record for good (permission,
  /// validation); [lastError] keeps the reason. Not retried automatically.
  final DateTime? failedAt;
  const OutboxEntry({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.createdAt,
    required this.attempts,
    this.lastError,
    this.lastAttemptAt,
    this.sentAt,
    this.failedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['entity_type'] = Variable<String>(entityType);
    map['entity_id'] = Variable<String>(entityId);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    if (!nullToAbsent || lastAttemptAt != null) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
    }
    if (!nullToAbsent || sentAt != null) {
      map['sent_at'] = Variable<DateTime>(sentAt);
    }
    if (!nullToAbsent || failedAt != null) {
      map['failed_at'] = Variable<DateTime>(failedAt);
    }
    return map;
  }

  OutboxEntriesCompanion toCompanion(bool nullToAbsent) {
    return OutboxEntriesCompanion(
      id: Value(id),
      entityType: Value(entityType),
      entityId: Value(entityId),
      createdAt: Value(createdAt),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      lastAttemptAt: lastAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAttemptAt),
      sentAt: sentAt == null && nullToAbsent
          ? const Value.absent()
          : Value(sentAt),
      failedAt: failedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(failedAt),
    );
  }

  factory OutboxEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OutboxEntry(
      id: serializer.fromJson<int>(json['id']),
      entityType: serializer.fromJson<String>(json['entityType']),
      entityId: serializer.fromJson<String>(json['entityId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),
      sentAt: serializer.fromJson<DateTime?>(json['sentAt']),
      failedAt: serializer.fromJson<DateTime?>(json['failedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'entityType': serializer.toJson<String>(entityType),
      'entityId': serializer.toJson<String>(entityId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),
      'sentAt': serializer.toJson<DateTime?>(sentAt),
      'failedAt': serializer.toJson<DateTime?>(failedAt),
    };
  }

  OutboxEntry copyWith({
    int? id,
    String? entityType,
    String? entityId,
    DateTime? createdAt,
    int? attempts,
    Value<String?> lastError = const Value.absent(),
    Value<DateTime?> lastAttemptAt = const Value.absent(),
    Value<DateTime?> sentAt = const Value.absent(),
    Value<DateTime?> failedAt = const Value.absent(),
  }) => OutboxEntry(
    id: id ?? this.id,
    entityType: entityType ?? this.entityType,
    entityId: entityId ?? this.entityId,
    createdAt: createdAt ?? this.createdAt,
    attempts: attempts ?? this.attempts,
    lastError: lastError.present ? lastError.value : this.lastError,
    lastAttemptAt: lastAttemptAt.present
        ? lastAttemptAt.value
        : this.lastAttemptAt,
    sentAt: sentAt.present ? sentAt.value : this.sentAt,
    failedAt: failedAt.present ? failedAt.value : this.failedAt,
  );
  OutboxEntry copyWithCompanion(OutboxEntriesCompanion data) {
    return OutboxEntry(
      id: data.id.present ? data.id.value : this.id,
      entityType: data.entityType.present
          ? data.entityType.value
          : this.entityType,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      lastAttemptAt: data.lastAttemptAt.present
          ? data.lastAttemptAt.value
          : this.lastAttemptAt,
      sentAt: data.sentAt.present ? data.sentAt.value : this.sentAt,
      failedAt: data.failedAt.present ? data.failedAt.value : this.failedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntry(')
          ..write('id: $id, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('createdAt: $createdAt, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('sentAt: $sentAt, ')
          ..write('failedAt: $failedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    entityType,
    entityId,
    createdAt,
    attempts,
    lastError,
    lastAttemptAt,
    sentAt,
    failedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OutboxEntry &&
          other.id == this.id &&
          other.entityType == this.entityType &&
          other.entityId == this.entityId &&
          other.createdAt == this.createdAt &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.lastAttemptAt == this.lastAttemptAt &&
          other.sentAt == this.sentAt &&
          other.failedAt == this.failedAt);
}

class OutboxEntriesCompanion extends UpdateCompanion<OutboxEntry> {
  final Value<int> id;
  final Value<String> entityType;
  final Value<String> entityId;
  final Value<DateTime> createdAt;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<DateTime?> lastAttemptAt;
  final Value<DateTime?> sentAt;
  final Value<DateTime?> failedAt;
  const OutboxEntriesCompanion({
    this.id = const Value.absent(),
    this.entityType = const Value.absent(),
    this.entityId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.sentAt = const Value.absent(),
    this.failedAt = const Value.absent(),
  });
  OutboxEntriesCompanion.insert({
    this.id = const Value.absent(),
    required String entityType,
    required String entityId,
    required DateTime createdAt,
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.sentAt = const Value.absent(),
    this.failedAt = const Value.absent(),
  }) : entityType = Value(entityType),
       entityId = Value(entityId),
       createdAt = Value(createdAt);
  static Insertable<OutboxEntry> custom({
    Expression<int>? id,
    Expression<String>? entityType,
    Expression<String>? entityId,
    Expression<DateTime>? createdAt,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<DateTime>? lastAttemptAt,
    Expression<DateTime>? sentAt,
    Expression<DateTime>? failedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (entityType != null) 'entity_type': entityType,
      if (entityId != null) 'entity_id': entityId,
      if (createdAt != null) 'created_at': createdAt,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (lastAttemptAt != null) 'last_attempt_at': lastAttemptAt,
      if (sentAt != null) 'sent_at': sentAt,
      if (failedAt != null) 'failed_at': failedAt,
    });
  }

  OutboxEntriesCompanion copyWith({
    Value<int>? id,
    Value<String>? entityType,
    Value<String>? entityId,
    Value<DateTime>? createdAt,
    Value<int>? attempts,
    Value<String?>? lastError,
    Value<DateTime?>? lastAttemptAt,
    Value<DateTime?>? sentAt,
    Value<DateTime?>? failedAt,
  }) {
    return OutboxEntriesCompanion(
      id: id ?? this.id,
      entityType: entityType ?? this.entityType,
      entityId: entityId ?? this.entityId,
      createdAt: createdAt ?? this.createdAt,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      sentAt: sentAt ?? this.sentAt,
      failedAt: failedAt ?? this.failedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (lastAttemptAt.present) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);
    }
    if (sentAt.present) {
      map['sent_at'] = Variable<DateTime>(sentAt.value);
    }
    if (failedAt.present) {
      map['failed_at'] = Variable<DateTime>(failedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntriesCompanion(')
          ..write('id: $id, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('createdAt: $createdAt, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('sentAt: $sentAt, ')
          ..write('failedAt: $failedAt')
          ..write(')'))
        .toString();
  }
}

class $TaskCacheTable extends TaskCache
    with TableInfo<$TaskCacheTable, TaskCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TaskCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tasksJsonMeta = const VerificationMeta(
    'tasksJson',
  );
  @override
  late final GeneratedColumn<String> tasksJson = GeneratedColumn<String>(
    'tasks_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fetchedAtMeta = const VerificationMeta(
    'fetchedAt',
  );
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
    'fetched_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [userId, tasksJson, fetchedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'task_cache';
  @override
  VerificationContext validateIntegrity(
    Insertable<TaskCacheRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('tasks_json')) {
      context.handle(
        _tasksJsonMeta,
        tasksJson.isAcceptableOrUnknown(data['tasks_json']!, _tasksJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_tasksJsonMeta);
    }
    if (data.containsKey('fetched_at')) {
      context.handle(
        _fetchedAtMeta,
        fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId};
  @override
  TaskCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TaskCacheRow(
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      tasksJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tasks_json'],
      )!,
      fetchedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}fetched_at'],
      )!,
    );
  }

  @override
  $TaskCacheTable createAlias(String alias) {
    return $TaskCacheTable(attachedDatabase, alias);
  }
}

class TaskCacheRow extends DataClass implements Insertable<TaskCacheRow> {
  final String userId;

  /// JSON array of FieldTask.toJson().
  final String tasksJson;
  final DateTime fetchedAt;
  const TaskCacheRow({
    required this.userId,
    required this.tasksJson,
    required this.fetchedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    map['tasks_json'] = Variable<String>(tasksJson);
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  TaskCacheCompanion toCompanion(bool nullToAbsent) {
    return TaskCacheCompanion(
      userId: Value(userId),
      tasksJson: Value(tasksJson),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory TaskCacheRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TaskCacheRow(
      userId: serializer.fromJson<String>(json['userId']),
      tasksJson: serializer.fromJson<String>(json['tasksJson']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'tasksJson': serializer.toJson<String>(tasksJson),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  TaskCacheRow copyWith({
    String? userId,
    String? tasksJson,
    DateTime? fetchedAt,
  }) => TaskCacheRow(
    userId: userId ?? this.userId,
    tasksJson: tasksJson ?? this.tasksJson,
    fetchedAt: fetchedAt ?? this.fetchedAt,
  );
  TaskCacheRow copyWithCompanion(TaskCacheCompanion data) {
    return TaskCacheRow(
      userId: data.userId.present ? data.userId.value : this.userId,
      tasksJson: data.tasksJson.present ? data.tasksJson.value : this.tasksJson,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TaskCacheRow(')
          ..write('userId: $userId, ')
          ..write('tasksJson: $tasksJson, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(userId, tasksJson, fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TaskCacheRow &&
          other.userId == this.userId &&
          other.tasksJson == this.tasksJson &&
          other.fetchedAt == this.fetchedAt);
}

class TaskCacheCompanion extends UpdateCompanion<TaskCacheRow> {
  final Value<String> userId;
  final Value<String> tasksJson;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const TaskCacheCompanion({
    this.userId = const Value.absent(),
    this.tasksJson = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TaskCacheCompanion.insert({
    required String userId,
    required String tasksJson,
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  }) : userId = Value(userId),
       tasksJson = Value(tasksJson),
       fetchedAt = Value(fetchedAt);
  static Insertable<TaskCacheRow> custom({
    Expression<String>? userId,
    Expression<String>? tasksJson,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (tasksJson != null) 'tasks_json': tasksJson,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TaskCacheCompanion copyWith({
    Value<String>? userId,
    Value<String>? tasksJson,
    Value<DateTime>? fetchedAt,
    Value<int>? rowid,
  }) {
    return TaskCacheCompanion(
      userId: userId ?? this.userId,
      tasksJson: tasksJson ?? this.tasksJson,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (tasksJson.present) {
      map['tasks_json'] = Variable<String>(tasksJson.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<DateTime>(fetchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TaskCacheCompanion(')
          ..write('userId: $userId, ')
          ..write('tasksJson: $tasksJson, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $VerificationResultsTable extends VerificationResults
    with TableInfo<$VerificationResultsTable, VerificationResultRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $VerificationResultsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tourIdMeta = const VerificationMeta('tourId');
  @override
  late final GeneratedColumn<String> tourId = GeneratedColumn<String>(
    'tour_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES sessions (id)',
    ),
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _slotCodeMeta = const VerificationMeta(
    'slotCode',
  );
  @override
  late final GeneratedColumn<String> slotCode = GeneratedColumn<String>(
    'slot_code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _treePresentMeta = const VerificationMeta(
    'treePresent',
  );
  @override
  late final GeneratedColumn<bool> treePresent = GeneratedColumn<bool>(
    'tree_present',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("tree_present" IN (0, 1))',
    ),
  );
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
    'note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _captureSha256Meta = const VerificationMeta(
    'captureSha256',
  );
  @override
  late final GeneratedColumn<String> captureSha256 = GeneratedColumn<String>(
    'capture_sha256',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _recordedAtMeta = const VerificationMeta(
    'recordedAt',
  );
  @override
  late final GeneratedColumn<DateTime> recordedAt = GeneratedColumn<DateTime>(
    'recorded_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    tourId,
    itemId,
    slotCode,
    treePresent,
    note,
    captureSha256,
    recordedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'verification_results';
  @override
  VerificationContext validateIntegrity(
    Insertable<VerificationResultRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('tour_id')) {
      context.handle(
        _tourIdMeta,
        tourId.isAcceptableOrUnknown(data['tour_id']!, _tourIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tourIdMeta);
    }
    if (data.containsKey('item_id')) {
      context.handle(
        _itemIdMeta,
        itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta),
      );
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    if (data.containsKey('slot_code')) {
      context.handle(
        _slotCodeMeta,
        slotCode.isAcceptableOrUnknown(data['slot_code']!, _slotCodeMeta),
      );
    } else if (isInserting) {
      context.missing(_slotCodeMeta);
    }
    if (data.containsKey('tree_present')) {
      context.handle(
        _treePresentMeta,
        treePresent.isAcceptableOrUnknown(
          data['tree_present']!,
          _treePresentMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_treePresentMeta);
    }
    if (data.containsKey('note')) {
      context.handle(
        _noteMeta,
        note.isAcceptableOrUnknown(data['note']!, _noteMeta),
      );
    }
    if (data.containsKey('capture_sha256')) {
      context.handle(
        _captureSha256Meta,
        captureSha256.isAcceptableOrUnknown(
          data['capture_sha256']!,
          _captureSha256Meta,
        ),
      );
    }
    if (data.containsKey('recorded_at')) {
      context.handle(
        _recordedAtMeta,
        recordedAt.isAcceptableOrUnknown(data['recorded_at']!, _recordedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_recordedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  VerificationResultRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return VerificationResultRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      tourId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tour_id'],
      )!,
      itemId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}item_id'],
      )!,
      slotCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}slot_code'],
      )!,
      treePresent: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}tree_present'],
      )!,
      note: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}note'],
      ),
      captureSha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}capture_sha256'],
      ),
      recordedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}recorded_at'],
      )!,
    );
  }

  @override
  $VerificationResultsTable createAlias(String alias) {
    return $VerificationResultsTable(attachedDatabase, alias);
  }
}

class VerificationResultRow extends DataClass
    implements Insertable<VerificationResultRow> {
  final String id;

  /// The tour (`verification` session); also the photo's session.
  final String tourId;
  final String itemId;
  final String slotCode;
  final bool treePresent;
  final String? note;

  /// Close-up photo (`captures.sha256`), optional.
  final String? captureSha256;
  final DateTime recordedAt;
  const VerificationResultRow({
    required this.id,
    required this.tourId,
    required this.itemId,
    required this.slotCode,
    required this.treePresent,
    this.note,
    this.captureSha256,
    required this.recordedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['tour_id'] = Variable<String>(tourId);
    map['item_id'] = Variable<String>(itemId);
    map['slot_code'] = Variable<String>(slotCode);
    map['tree_present'] = Variable<bool>(treePresent);
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    if (!nullToAbsent || captureSha256 != null) {
      map['capture_sha256'] = Variable<String>(captureSha256);
    }
    map['recorded_at'] = Variable<DateTime>(recordedAt);
    return map;
  }

  VerificationResultsCompanion toCompanion(bool nullToAbsent) {
    return VerificationResultsCompanion(
      id: Value(id),
      tourId: Value(tourId),
      itemId: Value(itemId),
      slotCode: Value(slotCode),
      treePresent: Value(treePresent),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      captureSha256: captureSha256 == null && nullToAbsent
          ? const Value.absent()
          : Value(captureSha256),
      recordedAt: Value(recordedAt),
    );
  }

  factory VerificationResultRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return VerificationResultRow(
      id: serializer.fromJson<String>(json['id']),
      tourId: serializer.fromJson<String>(json['tourId']),
      itemId: serializer.fromJson<String>(json['itemId']),
      slotCode: serializer.fromJson<String>(json['slotCode']),
      treePresent: serializer.fromJson<bool>(json['treePresent']),
      note: serializer.fromJson<String?>(json['note']),
      captureSha256: serializer.fromJson<String?>(json['captureSha256']),
      recordedAt: serializer.fromJson<DateTime>(json['recordedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'tourId': serializer.toJson<String>(tourId),
      'itemId': serializer.toJson<String>(itemId),
      'slotCode': serializer.toJson<String>(slotCode),
      'treePresent': serializer.toJson<bool>(treePresent),
      'note': serializer.toJson<String?>(note),
      'captureSha256': serializer.toJson<String?>(captureSha256),
      'recordedAt': serializer.toJson<DateTime>(recordedAt),
    };
  }

  VerificationResultRow copyWith({
    String? id,
    String? tourId,
    String? itemId,
    String? slotCode,
    bool? treePresent,
    Value<String?> note = const Value.absent(),
    Value<String?> captureSha256 = const Value.absent(),
    DateTime? recordedAt,
  }) => VerificationResultRow(
    id: id ?? this.id,
    tourId: tourId ?? this.tourId,
    itemId: itemId ?? this.itemId,
    slotCode: slotCode ?? this.slotCode,
    treePresent: treePresent ?? this.treePresent,
    note: note.present ? note.value : this.note,
    captureSha256: captureSha256.present
        ? captureSha256.value
        : this.captureSha256,
    recordedAt: recordedAt ?? this.recordedAt,
  );
  VerificationResultRow copyWithCompanion(VerificationResultsCompanion data) {
    return VerificationResultRow(
      id: data.id.present ? data.id.value : this.id,
      tourId: data.tourId.present ? data.tourId.value : this.tourId,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      slotCode: data.slotCode.present ? data.slotCode.value : this.slotCode,
      treePresent: data.treePresent.present
          ? data.treePresent.value
          : this.treePresent,
      note: data.note.present ? data.note.value : this.note,
      captureSha256: data.captureSha256.present
          ? data.captureSha256.value
          : this.captureSha256,
      recordedAt: data.recordedAt.present
          ? data.recordedAt.value
          : this.recordedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('VerificationResultRow(')
          ..write('id: $id, ')
          ..write('tourId: $tourId, ')
          ..write('itemId: $itemId, ')
          ..write('slotCode: $slotCode, ')
          ..write('treePresent: $treePresent, ')
          ..write('note: $note, ')
          ..write('captureSha256: $captureSha256, ')
          ..write('recordedAt: $recordedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    tourId,
    itemId,
    slotCode,
    treePresent,
    note,
    captureSha256,
    recordedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is VerificationResultRow &&
          other.id == this.id &&
          other.tourId == this.tourId &&
          other.itemId == this.itemId &&
          other.slotCode == this.slotCode &&
          other.treePresent == this.treePresent &&
          other.note == this.note &&
          other.captureSha256 == this.captureSha256 &&
          other.recordedAt == this.recordedAt);
}

class VerificationResultsCompanion
    extends UpdateCompanion<VerificationResultRow> {
  final Value<String> id;
  final Value<String> tourId;
  final Value<String> itemId;
  final Value<String> slotCode;
  final Value<bool> treePresent;
  final Value<String?> note;
  final Value<String?> captureSha256;
  final Value<DateTime> recordedAt;
  final Value<int> rowid;
  const VerificationResultsCompanion({
    this.id = const Value.absent(),
    this.tourId = const Value.absent(),
    this.itemId = const Value.absent(),
    this.slotCode = const Value.absent(),
    this.treePresent = const Value.absent(),
    this.note = const Value.absent(),
    this.captureSha256 = const Value.absent(),
    this.recordedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  VerificationResultsCompanion.insert({
    required String id,
    required String tourId,
    required String itemId,
    required String slotCode,
    required bool treePresent,
    this.note = const Value.absent(),
    this.captureSha256 = const Value.absent(),
    required DateTime recordedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       tourId = Value(tourId),
       itemId = Value(itemId),
       slotCode = Value(slotCode),
       treePresent = Value(treePresent),
       recordedAt = Value(recordedAt);
  static Insertable<VerificationResultRow> custom({
    Expression<String>? id,
    Expression<String>? tourId,
    Expression<String>? itemId,
    Expression<String>? slotCode,
    Expression<bool>? treePresent,
    Expression<String>? note,
    Expression<String>? captureSha256,
    Expression<DateTime>? recordedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (tourId != null) 'tour_id': tourId,
      if (itemId != null) 'item_id': itemId,
      if (slotCode != null) 'slot_code': slotCode,
      if (treePresent != null) 'tree_present': treePresent,
      if (note != null) 'note': note,
      if (captureSha256 != null) 'capture_sha256': captureSha256,
      if (recordedAt != null) 'recorded_at': recordedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  VerificationResultsCompanion copyWith({
    Value<String>? id,
    Value<String>? tourId,
    Value<String>? itemId,
    Value<String>? slotCode,
    Value<bool>? treePresent,
    Value<String?>? note,
    Value<String?>? captureSha256,
    Value<DateTime>? recordedAt,
    Value<int>? rowid,
  }) {
    return VerificationResultsCompanion(
      id: id ?? this.id,
      tourId: tourId ?? this.tourId,
      itemId: itemId ?? this.itemId,
      slotCode: slotCode ?? this.slotCode,
      treePresent: treePresent ?? this.treePresent,
      note: note ?? this.note,
      captureSha256: captureSha256 ?? this.captureSha256,
      recordedAt: recordedAt ?? this.recordedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (tourId.present) {
      map['tour_id'] = Variable<String>(tourId.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<String>(itemId.value);
    }
    if (slotCode.present) {
      map['slot_code'] = Variable<String>(slotCode.value);
    }
    if (treePresent.present) {
      map['tree_present'] = Variable<bool>(treePresent.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (captureSha256.present) {
      map['capture_sha256'] = Variable<String>(captureSha256.value);
    }
    if (recordedAt.present) {
      map['recorded_at'] = Variable<DateTime>(recordedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('VerificationResultsCompanion(')
          ..write('id: $id, ')
          ..write('tourId: $tourId, ')
          ..write('itemId: $itemId, ')
          ..write('slotCode: $slotCode, ')
          ..write('treePresent: $treePresent, ')
          ..write('note: $note, ')
          ..write('captureSha256: $captureSha256, ')
          ..write('recordedAt: $recordedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ParcelRoutesTable extends ParcelRoutes
    with TableInfo<$ParcelRoutesTable, ParcelRouteRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ParcelRoutesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _parcelIdMeta = const VerificationMeta(
    'parcelId',
  );
  @override
  late final GeneratedColumn<String> parcelId = GeneratedColumn<String>(
    'parcel_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _versionMeta = const VerificationMeta(
    'version',
  );
  @override
  late final GeneratedColumn<int> version = GeneratedColumn<int>(
    'version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _contentHashMeta = const VerificationMeta(
    'contentHash',
  );
  @override
  late final GeneratedColumn<String> contentHash = GeneratedColumn<String>(
    'content_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _generatorMeta = const VerificationMeta(
    'generator',
  );
  @override
  late final GeneratedColumn<String> generator = GeneratedColumn<String>(
    'generator',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _basisMeta = const VerificationMeta('basis');
  @override
  late final GeneratedColumn<String> basis = GeneratedColumn<String>(
    'basis',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _routeJsonMeta = const VerificationMeta(
    'routeJson',
  );
  @override
  late final GeneratedColumn<String> routeJson = GeneratedColumn<String>(
    'route_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES sessions (id)',
    ),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _syncedMeta = const VerificationMeta('synced');
  @override
  late final GeneratedColumn<bool> synced = GeneratedColumn<bool>(
    'synced',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("synced" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    parcelId,
    version,
    contentHash,
    generator,
    basis,
    routeJson,
    sessionId,
    createdAt,
    synced,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'parcel_routes';
  @override
  VerificationContext validateIntegrity(
    Insertable<ParcelRouteRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('parcel_id')) {
      context.handle(
        _parcelIdMeta,
        parcelId.isAcceptableOrUnknown(data['parcel_id']!, _parcelIdMeta),
      );
    } else if (isInserting) {
      context.missing(_parcelIdMeta);
    }
    if (data.containsKey('version')) {
      context.handle(
        _versionMeta,
        version.isAcceptableOrUnknown(data['version']!, _versionMeta),
      );
    } else if (isInserting) {
      context.missing(_versionMeta);
    }
    if (data.containsKey('content_hash')) {
      context.handle(
        _contentHashMeta,
        contentHash.isAcceptableOrUnknown(
          data['content_hash']!,
          _contentHashMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_contentHashMeta);
    }
    if (data.containsKey('generator')) {
      context.handle(
        _generatorMeta,
        generator.isAcceptableOrUnknown(data['generator']!, _generatorMeta),
      );
    } else if (isInserting) {
      context.missing(_generatorMeta);
    }
    if (data.containsKey('basis')) {
      context.handle(
        _basisMeta,
        basis.isAcceptableOrUnknown(data['basis']!, _basisMeta),
      );
    } else if (isInserting) {
      context.missing(_basisMeta);
    }
    if (data.containsKey('route_json')) {
      context.handle(
        _routeJsonMeta,
        routeJson.isAcceptableOrUnknown(data['route_json']!, _routeJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_routeJsonMeta);
    }
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('synced')) {
      context.handle(
        _syncedMeta,
        synced.isAcceptableOrUnknown(data['synced']!, _syncedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ParcelRouteRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ParcelRouteRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      parcelId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parcel_id'],
      )!,
      version: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}version'],
      )!,
      contentHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content_hash'],
      )!,
      generator: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}generator'],
      )!,
      basis: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}basis'],
      )!,
      routeJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}route_json'],
      )!,
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      synced: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}synced'],
      )!,
    );
  }

  @override
  $ParcelRoutesTable createAlias(String alias) {
    return $ParcelRoutesTable(attachedDatabase, alias);
  }
}

class ParcelRouteRow extends DataClass implements Insertable<ParcelRouteRow> {
  /// uuid v5 of `<parcel>/<content hash>` (route_store.dart).
  final String id;
  final String parcelId;

  /// Version guessed on the phone; replaced by the server's after upload.
  final int version;
  final String contentHash;
  final String generator;

  /// `inventory` or `boundary`.
  final String basis;

  /// GridRoute.toJson().
  final String routeJson;

  /// The visit that first used it.
  final String sessionId;
  final DateTime createdAt;

  /// The server stored it (and [version] is the server's).
  final bool synced;
  const ParcelRouteRow({
    required this.id,
    required this.parcelId,
    required this.version,
    required this.contentHash,
    required this.generator,
    required this.basis,
    required this.routeJson,
    required this.sessionId,
    required this.createdAt,
    required this.synced,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['parcel_id'] = Variable<String>(parcelId);
    map['version'] = Variable<int>(version);
    map['content_hash'] = Variable<String>(contentHash);
    map['generator'] = Variable<String>(generator);
    map['basis'] = Variable<String>(basis);
    map['route_json'] = Variable<String>(routeJson);
    map['session_id'] = Variable<String>(sessionId);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['synced'] = Variable<bool>(synced);
    return map;
  }

  ParcelRoutesCompanion toCompanion(bool nullToAbsent) {
    return ParcelRoutesCompanion(
      id: Value(id),
      parcelId: Value(parcelId),
      version: Value(version),
      contentHash: Value(contentHash),
      generator: Value(generator),
      basis: Value(basis),
      routeJson: Value(routeJson),
      sessionId: Value(sessionId),
      createdAt: Value(createdAt),
      synced: Value(synced),
    );
  }

  factory ParcelRouteRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ParcelRouteRow(
      id: serializer.fromJson<String>(json['id']),
      parcelId: serializer.fromJson<String>(json['parcelId']),
      version: serializer.fromJson<int>(json['version']),
      contentHash: serializer.fromJson<String>(json['contentHash']),
      generator: serializer.fromJson<String>(json['generator']),
      basis: serializer.fromJson<String>(json['basis']),
      routeJson: serializer.fromJson<String>(json['routeJson']),
      sessionId: serializer.fromJson<String>(json['sessionId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      synced: serializer.fromJson<bool>(json['synced']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'parcelId': serializer.toJson<String>(parcelId),
      'version': serializer.toJson<int>(version),
      'contentHash': serializer.toJson<String>(contentHash),
      'generator': serializer.toJson<String>(generator),
      'basis': serializer.toJson<String>(basis),
      'routeJson': serializer.toJson<String>(routeJson),
      'sessionId': serializer.toJson<String>(sessionId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'synced': serializer.toJson<bool>(synced),
    };
  }

  ParcelRouteRow copyWith({
    String? id,
    String? parcelId,
    int? version,
    String? contentHash,
    String? generator,
    String? basis,
    String? routeJson,
    String? sessionId,
    DateTime? createdAt,
    bool? synced,
  }) => ParcelRouteRow(
    id: id ?? this.id,
    parcelId: parcelId ?? this.parcelId,
    version: version ?? this.version,
    contentHash: contentHash ?? this.contentHash,
    generator: generator ?? this.generator,
    basis: basis ?? this.basis,
    routeJson: routeJson ?? this.routeJson,
    sessionId: sessionId ?? this.sessionId,
    createdAt: createdAt ?? this.createdAt,
    synced: synced ?? this.synced,
  );
  ParcelRouteRow copyWithCompanion(ParcelRoutesCompanion data) {
    return ParcelRouteRow(
      id: data.id.present ? data.id.value : this.id,
      parcelId: data.parcelId.present ? data.parcelId.value : this.parcelId,
      version: data.version.present ? data.version.value : this.version,
      contentHash: data.contentHash.present
          ? data.contentHash.value
          : this.contentHash,
      generator: data.generator.present ? data.generator.value : this.generator,
      basis: data.basis.present ? data.basis.value : this.basis,
      routeJson: data.routeJson.present ? data.routeJson.value : this.routeJson,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      synced: data.synced.present ? data.synced.value : this.synced,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ParcelRouteRow(')
          ..write('id: $id, ')
          ..write('parcelId: $parcelId, ')
          ..write('version: $version, ')
          ..write('contentHash: $contentHash, ')
          ..write('generator: $generator, ')
          ..write('basis: $basis, ')
          ..write('routeJson: $routeJson, ')
          ..write('sessionId: $sessionId, ')
          ..write('createdAt: $createdAt, ')
          ..write('synced: $synced')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    parcelId,
    version,
    contentHash,
    generator,
    basis,
    routeJson,
    sessionId,
    createdAt,
    synced,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ParcelRouteRow &&
          other.id == this.id &&
          other.parcelId == this.parcelId &&
          other.version == this.version &&
          other.contentHash == this.contentHash &&
          other.generator == this.generator &&
          other.basis == this.basis &&
          other.routeJson == this.routeJson &&
          other.sessionId == this.sessionId &&
          other.createdAt == this.createdAt &&
          other.synced == this.synced);
}

class ParcelRoutesCompanion extends UpdateCompanion<ParcelRouteRow> {
  final Value<String> id;
  final Value<String> parcelId;
  final Value<int> version;
  final Value<String> contentHash;
  final Value<String> generator;
  final Value<String> basis;
  final Value<String> routeJson;
  final Value<String> sessionId;
  final Value<DateTime> createdAt;
  final Value<bool> synced;
  final Value<int> rowid;
  const ParcelRoutesCompanion({
    this.id = const Value.absent(),
    this.parcelId = const Value.absent(),
    this.version = const Value.absent(),
    this.contentHash = const Value.absent(),
    this.generator = const Value.absent(),
    this.basis = const Value.absent(),
    this.routeJson = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.synced = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ParcelRoutesCompanion.insert({
    required String id,
    required String parcelId,
    required int version,
    required String contentHash,
    required String generator,
    required String basis,
    required String routeJson,
    required String sessionId,
    required DateTime createdAt,
    this.synced = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       parcelId = Value(parcelId),
       version = Value(version),
       contentHash = Value(contentHash),
       generator = Value(generator),
       basis = Value(basis),
       routeJson = Value(routeJson),
       sessionId = Value(sessionId),
       createdAt = Value(createdAt);
  static Insertable<ParcelRouteRow> custom({
    Expression<String>? id,
    Expression<String>? parcelId,
    Expression<int>? version,
    Expression<String>? contentHash,
    Expression<String>? generator,
    Expression<String>? basis,
    Expression<String>? routeJson,
    Expression<String>? sessionId,
    Expression<DateTime>? createdAt,
    Expression<bool>? synced,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (parcelId != null) 'parcel_id': parcelId,
      if (version != null) 'version': version,
      if (contentHash != null) 'content_hash': contentHash,
      if (generator != null) 'generator': generator,
      if (basis != null) 'basis': basis,
      if (routeJson != null) 'route_json': routeJson,
      if (sessionId != null) 'session_id': sessionId,
      if (createdAt != null) 'created_at': createdAt,
      if (synced != null) 'synced': synced,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ParcelRoutesCompanion copyWith({
    Value<String>? id,
    Value<String>? parcelId,
    Value<int>? version,
    Value<String>? contentHash,
    Value<String>? generator,
    Value<String>? basis,
    Value<String>? routeJson,
    Value<String>? sessionId,
    Value<DateTime>? createdAt,
    Value<bool>? synced,
    Value<int>? rowid,
  }) {
    return ParcelRoutesCompanion(
      id: id ?? this.id,
      parcelId: parcelId ?? this.parcelId,
      version: version ?? this.version,
      contentHash: contentHash ?? this.contentHash,
      generator: generator ?? this.generator,
      basis: basis ?? this.basis,
      routeJson: routeJson ?? this.routeJson,
      sessionId: sessionId ?? this.sessionId,
      createdAt: createdAt ?? this.createdAt,
      synced: synced ?? this.synced,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (parcelId.present) {
      map['parcel_id'] = Variable<String>(parcelId.value);
    }
    if (version.present) {
      map['version'] = Variable<int>(version.value);
    }
    if (contentHash.present) {
      map['content_hash'] = Variable<String>(contentHash.value);
    }
    if (generator.present) {
      map['generator'] = Variable<String>(generator.value);
    }
    if (basis.present) {
      map['basis'] = Variable<String>(basis.value);
    }
    if (routeJson.present) {
      map['route_json'] = Variable<String>(routeJson.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (synced.present) {
      map['synced'] = Variable<bool>(synced.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ParcelRoutesCompanion(')
          ..write('id: $id, ')
          ..write('parcelId: $parcelId, ')
          ..write('version: $version, ')
          ..write('contentHash: $contentHash, ')
          ..write('generator: $generator, ')
          ..write('basis: $basis, ')
          ..write('routeJson: $routeJson, ')
          ..write('sessionId: $sessionId, ')
          ..write('createdAt: $createdAt, ')
          ..write('synced: $synced, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $SessionsTable sessions = $SessionsTable(this);
  late final $SessionEventsTable sessionEvents = $SessionEventsTable(this);
  late final $CapturesTable captures = $CapturesTable(this);
  late final $MeasurementsTable measurements = $MeasurementsTable(this);
  late final $OutboxEntriesTable outboxEntries = $OutboxEntriesTable(this);
  late final $TaskCacheTable taskCache = $TaskCacheTable(this);
  late final $VerificationResultsTable verificationResults =
      $VerificationResultsTable(this);
  late final $ParcelRoutesTable parcelRoutes = $ParcelRoutesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    sessions,
    sessionEvents,
    captures,
    measurements,
    outboxEntries,
    taskCache,
    verificationResults,
    parcelRoutes,
  ];
  @override
  DriftDatabaseOptions get options =>
      const DriftDatabaseOptions(storeDateTimeAsText: true);
}

typedef $$SessionsTableCreateCompanionBuilder = SessionsCompanion Function({
  required String id,
  required String parcelId,
  Value<String?> taskId,
  required String sessionType,
  required String visitKind,
  Value<String?> season,
  Value<String?> operatorId,
  required String methodologyVersion,
  required String appVersion,
  Value<String?> loggerName,
  Value<String?> loggerFirmware,
  required DateTime startedAt,
  Value<int?> startGpsTimeMs,
  Value<DateTime?> stoppedAt,
  Value<int?> stopGpsTimeMs,
  required String status,
  Value<String?> scanPlatform,
  Value<double?> cameraHeightM,
  Value<int> rowid,
});
typedef $$SessionsTableUpdateCompanionBuilder = SessionsCompanion Function({
  Value<String> id,
  Value<String> parcelId,
  Value<String?> taskId,
  Value<String> sessionType,
  Value<String> visitKind,
  Value<String?> season,
  Value<String?> operatorId,
  Value<String> methodologyVersion,
  Value<String> appVersion,
  Value<String?> loggerName,
  Value<String?> loggerFirmware,
  Value<DateTime> startedAt,
  Value<int?> startGpsTimeMs,
  Value<DateTime?> stoppedAt,
  Value<int?> stopGpsTimeMs,
  Value<String> status,
  Value<String?> scanPlatform,
  Value<double?> cameraHeightM,
  Value<int> rowid,
});

final class $$SessionsTableReferences
    extends BaseReferences<_$AppDatabase, $SessionsTable, SessionRow> {
  $$SessionsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$SessionEventsTable, List<SessionEventRow>>
  _sessionEventsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.sessionEvents,
    aliasName: 'sessions__id__session_events__session_id',
  );

  $$SessionEventsTableProcessedTableManager get sessionEventsRefs {
    final manager = $$SessionEventsTableTableManager(
      $_db,
      $_db.sessionEvents,
    ).filter((f) => f.sessionId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_sessionEventsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$CapturesTable, List<CaptureRow>>
  _capturesRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.captures,
    aliasName: 'sessions__id__captures__session_id',
  );

  $$CapturesTableProcessedTableManager get capturesRefs {
    final manager = $$CapturesTableTableManager(
      $_db,
      $_db.captures,
    ).filter((f) => f.sessionId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_capturesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$MeasurementsTable, List<MeasurementRow>>
  _measurementsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.measurements,
    aliasName: 'sessions__id__measurements__session_id',
  );

  $$MeasurementsTableProcessedTableManager get measurementsRefs {
    final manager = $$MeasurementsTableTableManager(
      $_db,
      $_db.measurements,
    ).filter((f) => f.sessionId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_measurementsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<
    $VerificationResultsTable,
    List<VerificationResultRow>
  >
  _verificationResultsRefsTable(_$AppDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.verificationResults,
        aliasName: 'sessions__id__verification_results__tour_id',
      );

  $$VerificationResultsTableProcessedTableManager get verificationResultsRefs {
    final manager = $$VerificationResultsTableTableManager(
      $_db,
      $_db.verificationResults,
    ).filter((f) => f.tourId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _verificationResultsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ParcelRoutesTable, List<ParcelRouteRow>>
  _parcelRoutesRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.parcelRoutes,
    aliasName: 'sessions__id__parcel_routes__session_id',
  );

  $$ParcelRoutesTableProcessedTableManager get parcelRoutesRefs {
    final manager = $$ParcelRoutesTableTableManager(
      $_db,
      $_db.parcelRoutes,
    ).filter((f) => f.sessionId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_parcelRoutesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$SessionsTableFilterComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parcelId => $composableBuilder(
    column: $table.parcelId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get taskId => $composableBuilder(
    column: $table.taskId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sessionType => $composableBuilder(
    column: $table.sessionType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get visitKind => $composableBuilder(
    column: $table.visitKind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get season => $composableBuilder(
    column: $table.season,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get operatorId => $composableBuilder(
    column: $table.operatorId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get methodologyVersion => $composableBuilder(
    column: $table.methodologyVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get appVersion => $composableBuilder(
    column: $table.appVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get loggerName => $composableBuilder(
    column: $table.loggerName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get loggerFirmware => $composableBuilder(
    column: $table.loggerFirmware,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get startedAt => $composableBuilder(
    column: $table.startedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get startGpsTimeMs => $composableBuilder(
    column: $table.startGpsTimeMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get stoppedAt => $composableBuilder(
    column: $table.stoppedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get stopGpsTimeMs => $composableBuilder(
    column: $table.stopGpsTimeMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get scanPlatform => $composableBuilder(
    column: $table.scanPlatform,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get cameraHeightM => $composableBuilder(
    column: $table.cameraHeightM,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> sessionEventsRefs(
    Expression<bool> Function($$SessionEventsTableFilterComposer f) f,
  ) {
    final $$SessionEventsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.sessionEvents,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionEventsTableFilterComposer(
            $db: $db,
            $table: $db.sessionEvents,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> capturesRefs(
    Expression<bool> Function($$CapturesTableFilterComposer f) f,
  ) {
    final $$CapturesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.captures,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CapturesTableFilterComposer(
            $db: $db,
            $table: $db.captures,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> measurementsRefs(
    Expression<bool> Function($$MeasurementsTableFilterComposer f) f,
  ) {
    final $$MeasurementsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.measurements,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$MeasurementsTableFilterComposer(
            $db: $db,
            $table: $db.measurements,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> verificationResultsRefs(
    Expression<bool> Function($$VerificationResultsTableFilterComposer f) f,
  ) {
    final $$VerificationResultsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.verificationResults,
      getReferencedColumn: (t) => t.tourId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$VerificationResultsTableFilterComposer(
            $db: $db,
            $table: $db.verificationResults,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> parcelRoutesRefs(
    Expression<bool> Function($$ParcelRoutesTableFilterComposer f) f,
  ) {
    final $$ParcelRoutesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.parcelRoutes,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ParcelRoutesTableFilterComposer(
            $db: $db,
            $table: $db.parcelRoutes,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$SessionsTableOrderingComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parcelId => $composableBuilder(
    column: $table.parcelId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get taskId => $composableBuilder(
    column: $table.taskId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sessionType => $composableBuilder(
    column: $table.sessionType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get visitKind => $composableBuilder(
    column: $table.visitKind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get season => $composableBuilder(
    column: $table.season,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get operatorId => $composableBuilder(
    column: $table.operatorId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get methodologyVersion => $composableBuilder(
    column: $table.methodologyVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get appVersion => $composableBuilder(
    column: $table.appVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get loggerName => $composableBuilder(
    column: $table.loggerName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get loggerFirmware => $composableBuilder(
    column: $table.loggerFirmware,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get startedAt => $composableBuilder(
    column: $table.startedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get startGpsTimeMs => $composableBuilder(
    column: $table.startGpsTimeMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get stoppedAt => $composableBuilder(
    column: $table.stoppedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get stopGpsTimeMs => $composableBuilder(
    column: $table.stopGpsTimeMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get scanPlatform => $composableBuilder(
    column: $table.scanPlatform,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get cameraHeightM => $composableBuilder(
    column: $table.cameraHeightM,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SessionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get parcelId =>
      $composableBuilder(column: $table.parcelId, builder: (column) => column);

  GeneratedColumn<String> get taskId =>
      $composableBuilder(column: $table.taskId, builder: (column) => column);

  GeneratedColumn<String> get sessionType => $composableBuilder(
    column: $table.sessionType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get visitKind =>
      $composableBuilder(column: $table.visitKind, builder: (column) => column);

  GeneratedColumn<String> get season =>
      $composableBuilder(column: $table.season, builder: (column) => column);

  GeneratedColumn<String> get operatorId => $composableBuilder(
    column: $table.operatorId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get methodologyVersion => $composableBuilder(
    column: $table.methodologyVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get appVersion => $composableBuilder(
    column: $table.appVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get loggerName => $composableBuilder(
    column: $table.loggerName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get loggerFirmware => $composableBuilder(
    column: $table.loggerFirmware,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => column);

  GeneratedColumn<int> get startGpsTimeMs => $composableBuilder(
    column: $table.startGpsTimeMs,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get stoppedAt =>
      $composableBuilder(column: $table.stoppedAt, builder: (column) => column);

  GeneratedColumn<int> get stopGpsTimeMs => $composableBuilder(
    column: $table.stopGpsTimeMs,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get scanPlatform => $composableBuilder(
    column: $table.scanPlatform,
    builder: (column) => column,
  );

  GeneratedColumn<double> get cameraHeightM => $composableBuilder(
    column: $table.cameraHeightM,
    builder: (column) => column,
  );

  Expression<T> sessionEventsRefs<T extends Object>(
    Expression<T> Function($$SessionEventsTableAnnotationComposer a) f,
  ) {
    final $$SessionEventsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.sessionEvents,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionEventsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessionEvents,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> capturesRefs<T extends Object>(
    Expression<T> Function($$CapturesTableAnnotationComposer a) f,
  ) {
    final $$CapturesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.captures,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CapturesTableAnnotationComposer(
            $db: $db,
            $table: $db.captures,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> measurementsRefs<T extends Object>(
    Expression<T> Function($$MeasurementsTableAnnotationComposer a) f,
  ) {
    final $$MeasurementsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.measurements,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$MeasurementsTableAnnotationComposer(
            $db: $db,
            $table: $db.measurements,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> verificationResultsRefs<T extends Object>(
    Expression<T> Function($$VerificationResultsTableAnnotationComposer a) f,
  ) {
    final $$VerificationResultsTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.id,
          referencedTable: $db.verificationResults,
          getReferencedColumn: (t) => t.tourId,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$VerificationResultsTableAnnotationComposer(
                $db: $db,
                $table: $db.verificationResults,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return f(composer);
  }

  Expression<T> parcelRoutesRefs<T extends Object>(
    Expression<T> Function($$ParcelRoutesTableAnnotationComposer a) f,
  ) {
    final $$ParcelRoutesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.parcelRoutes,
      getReferencedColumn: (t) => t.sessionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ParcelRoutesTableAnnotationComposer(
            $db: $db,
            $table: $db.parcelRoutes,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$SessionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SessionsTable,
          SessionRow,
          $$SessionsTableFilterComposer,
          $$SessionsTableOrderingComposer,
          $$SessionsTableAnnotationComposer,
          $$SessionsTableCreateCompanionBuilder,
          $$SessionsTableUpdateCompanionBuilder,
          (SessionRow, $$SessionsTableReferences),
          SessionRow,
          PrefetchHooks Function({
            bool sessionEventsRefs,
            bool capturesRefs,
            bool measurementsRefs,
            bool verificationResultsRefs,
            bool parcelRoutesRefs,
          })
        > {
  $$SessionsTableTableManager(_$AppDatabase db, $SessionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SessionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SessionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SessionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> parcelId = const Value.absent(),
                Value<String?> taskId = const Value.absent(),
                Value<String> sessionType = const Value.absent(),
                Value<String> visitKind = const Value.absent(),
                Value<String?> season = const Value.absent(),
                Value<String?> operatorId = const Value.absent(),
                Value<String> methodologyVersion = const Value.absent(),
                Value<String> appVersion = const Value.absent(),
                Value<String?> loggerName = const Value.absent(),
                Value<String?> loggerFirmware = const Value.absent(),
                Value<DateTime> startedAt = const Value.absent(),
                Value<int?> startGpsTimeMs = const Value.absent(),
                Value<DateTime?> stoppedAt = const Value.absent(),
                Value<int?> stopGpsTimeMs = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> scanPlatform = const Value.absent(),
                Value<double?> cameraHeightM = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SessionsCompanion(
                id: id,
                parcelId: parcelId,
                taskId: taskId,
                sessionType: sessionType,
                visitKind: visitKind,
                season: season,
                operatorId: operatorId,
                methodologyVersion: methodologyVersion,
                appVersion: appVersion,
                loggerName: loggerName,
                loggerFirmware: loggerFirmware,
                startedAt: startedAt,
                startGpsTimeMs: startGpsTimeMs,
                stoppedAt: stoppedAt,
                stopGpsTimeMs: stopGpsTimeMs,
                status: status,
                scanPlatform: scanPlatform,
                cameraHeightM: cameraHeightM,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String parcelId,
                Value<String?> taskId = const Value.absent(),
                required String sessionType,
                required String visitKind,
                Value<String?> season = const Value.absent(),
                Value<String?> operatorId = const Value.absent(),
                required String methodologyVersion,
                required String appVersion,
                Value<String?> loggerName = const Value.absent(),
                Value<String?> loggerFirmware = const Value.absent(),
                required DateTime startedAt,
                Value<int?> startGpsTimeMs = const Value.absent(),
                Value<DateTime?> stoppedAt = const Value.absent(),
                Value<int?> stopGpsTimeMs = const Value.absent(),
                required String status,
                Value<String?> scanPlatform = const Value.absent(),
                Value<double?> cameraHeightM = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SessionsCompanion.insert(
                id: id,
                parcelId: parcelId,
                taskId: taskId,
                sessionType: sessionType,
                visitKind: visitKind,
                season: season,
                operatorId: operatorId,
                methodologyVersion: methodologyVersion,
                appVersion: appVersion,
                loggerName: loggerName,
                loggerFirmware: loggerFirmware,
                startedAt: startedAt,
                startGpsTimeMs: startGpsTimeMs,
                stoppedAt: stoppedAt,
                stopGpsTimeMs: stopGpsTimeMs,
                status: status,
                scanPlatform: scanPlatform,
                cameraHeightM: cameraHeightM,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SessionsTable, SessionRow>(table),
                  $$SessionsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({
                sessionEventsRefs = false,
                capturesRefs = false,
                measurementsRefs = false,
                verificationResultsRefs = false,
                parcelRoutesRefs = false,
              }) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (sessionEventsRefs) db.sessionEvents,
                    if (capturesRefs) db.captures,
                    if (measurementsRefs) db.measurements,
                    if (verificationResultsRefs) db.verificationResults,
                    if (parcelRoutesRefs) db.parcelRoutes,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (sessionEventsRefs)
                        await $_getPrefetchedData<
                          SessionRow,
                          $SessionsTable,
                          SessionEventRow
                        >(
                          currentTable: table,
                          referencedTable: $$SessionsTableReferences
                              ._sessionEventsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionsTableReferences(
                                db,
                                table,
                                p0,
                              ).sessionEventsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.sessionId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (capturesRefs)
                        await $_getPrefetchedData<
                          SessionRow,
                          $SessionsTable,
                          CaptureRow
                        >(
                          currentTable: table,
                          referencedTable: $$SessionsTableReferences
                              ._capturesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionsTableReferences(
                                db,
                                table,
                                p0,
                              ).capturesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.sessionId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (measurementsRefs)
                        await $_getPrefetchedData<
                          SessionRow,
                          $SessionsTable,
                          MeasurementRow
                        >(
                          currentTable: table,
                          referencedTable: $$SessionsTableReferences
                              ._measurementsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionsTableReferences(
                                db,
                                table,
                                p0,
                              ).measurementsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.sessionId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (verificationResultsRefs)
                        await $_getPrefetchedData<
                          SessionRow,
                          $SessionsTable,
                          VerificationResultRow
                        >(
                          currentTable: table,
                          referencedTable: $$SessionsTableReferences
                              ._verificationResultsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionsTableReferences(
                                db,
                                table,
                                p0,
                              ).verificationResultsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.tourId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (parcelRoutesRefs)
                        await $_getPrefetchedData<
                          SessionRow,
                          $SessionsTable,
                          ParcelRouteRow
                        >(
                          currentTable: table,
                          referencedTable: $$SessionsTableReferences
                              ._parcelRoutesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionsTableReferences(
                                db,
                                table,
                                p0,
                              ).parcelRoutesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.sessionId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$SessionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SessionsTable,
      SessionRow,
      $$SessionsTableFilterComposer,
      $$SessionsTableOrderingComposer,
      $$SessionsTableAnnotationComposer,
      $$SessionsTableCreateCompanionBuilder,
      $$SessionsTableUpdateCompanionBuilder,
      (SessionRow, $$SessionsTableReferences),
      SessionRow,
      PrefetchHooks Function({
        bool sessionEventsRefs,
        bool capturesRefs,
        bool measurementsRefs,
        bool verificationResultsRefs,
        bool parcelRoutesRefs,
      })
    >;
typedef $$SessionEventsTableCreateCompanionBuilder =
    SessionEventsCompanion Function({
      required String id,
      required String sessionId,
      required String eventType,
      required String payload,
      Value<String?> dataJson,
      required DateTime phoneTime,
      required int gpsTimeMs,
      required String timeSource,
      required String loggerResult,
      Value<int> rowid,
    });
typedef $$SessionEventsTableUpdateCompanionBuilder =
    SessionEventsCompanion Function({
      Value<String> id,
      Value<String> sessionId,
      Value<String> eventType,
      Value<String> payload,
      Value<String?> dataJson,
      Value<DateTime> phoneTime,
      Value<int> gpsTimeMs,
      Value<String> timeSource,
      Value<String> loggerResult,
      Value<int> rowid,
    });

final class $$SessionEventsTableReferences
    extends
        BaseReferences<_$AppDatabase, $SessionEventsTable, SessionEventRow> {
  $$SessionEventsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $SessionsTable _sessionIdTable(_$AppDatabase db) =>
      db.sessions.createAlias('session_events__session_id__sessions__id');

  $$SessionsTableProcessedTableManager get sessionId {
    final $_column = $_itemColumn<String>('session_id')!;

    final manager = $$SessionsTableTableManager(
      $_db,
      $_db.sessions,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sessionIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$SessionEventsTableFilterComposer
    extends Composer<_$AppDatabase, $SessionEventsTable> {
  $$SessionEventsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get eventType => $composableBuilder(
    column: $table.eventType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dataJson => $composableBuilder(
    column: $table.dataJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get phoneTime => $composableBuilder(
    column: $table.phoneTime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get gpsTimeMs => $composableBuilder(
    column: $table.gpsTimeMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get loggerResult => $composableBuilder(
    column: $table.loggerResult,
    builder: (column) => ColumnFilters(column),
  );

  $$SessionsTableFilterComposer get sessionId {
    final $$SessionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableFilterComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SessionEventsTableOrderingComposer
    extends Composer<_$AppDatabase, $SessionEventsTable> {
  $$SessionEventsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get eventType => $composableBuilder(
    column: $table.eventType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dataJson => $composableBuilder(
    column: $table.dataJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get phoneTime => $composableBuilder(
    column: $table.phoneTime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get gpsTimeMs => $composableBuilder(
    column: $table.gpsTimeMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get loggerResult => $composableBuilder(
    column: $table.loggerResult,
    builder: (column) => ColumnOrderings(column),
  );

  $$SessionsTableOrderingComposer get sessionId {
    final $$SessionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableOrderingComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SessionEventsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SessionEventsTable> {
  $$SessionEventsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get eventType =>
      $composableBuilder(column: $table.eventType, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);

  GeneratedColumn<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => column);

  GeneratedColumn<DateTime> get phoneTime =>
      $composableBuilder(column: $table.phoneTime, builder: (column) => column);

  GeneratedColumn<int> get gpsTimeMs =>
      $composableBuilder(column: $table.gpsTimeMs, builder: (column) => column);

  GeneratedColumn<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => column,
  );

  GeneratedColumn<String> get loggerResult => $composableBuilder(
    column: $table.loggerResult,
    builder: (column) => column,
  );

  $$SessionsTableAnnotationComposer get sessionId {
    final $$SessionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SessionEventsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SessionEventsTable,
          SessionEventRow,
          $$SessionEventsTableFilterComposer,
          $$SessionEventsTableOrderingComposer,
          $$SessionEventsTableAnnotationComposer,
          $$SessionEventsTableCreateCompanionBuilder,
          $$SessionEventsTableUpdateCompanionBuilder,
          (SessionEventRow, $$SessionEventsTableReferences),
          SessionEventRow,
          PrefetchHooks Function({bool sessionId})
        > {
  $$SessionEventsTableTableManager(_$AppDatabase db, $SessionEventsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SessionEventsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SessionEventsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SessionEventsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> sessionId = const Value.absent(),
                Value<String> eventType = const Value.absent(),
                Value<String> payload = const Value.absent(),
                Value<String?> dataJson = const Value.absent(),
                Value<DateTime> phoneTime = const Value.absent(),
                Value<int> gpsTimeMs = const Value.absent(),
                Value<String> timeSource = const Value.absent(),
                Value<String> loggerResult = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SessionEventsCompanion(
                id: id,
                sessionId: sessionId,
                eventType: eventType,
                payload: payload,
                dataJson: dataJson,
                phoneTime: phoneTime,
                gpsTimeMs: gpsTimeMs,
                timeSource: timeSource,
                loggerResult: loggerResult,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String sessionId,
                required String eventType,
                required String payload,
                Value<String?> dataJson = const Value.absent(),
                required DateTime phoneTime,
                required int gpsTimeMs,
                required String timeSource,
                required String loggerResult,
                Value<int> rowid = const Value.absent(),
              }) => SessionEventsCompanion.insert(
                id: id,
                sessionId: sessionId,
                eventType: eventType,
                payload: payload,
                dataJson: dataJson,
                phoneTime: phoneTime,
                gpsTimeMs: gpsTimeMs,
                timeSource: timeSource,
                loggerResult: loggerResult,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SessionEventsTable, SessionEventRow>(table),
                  $$SessionEventsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({sessionId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (sessionId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.sessionId,
                        referencedTable: $$SessionEventsTableReferences
                            ._sessionIdTable(db),
                        referencedColumn: $$SessionEventsTableReferences
                            ._sessionIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$SessionEventsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SessionEventsTable,
      SessionEventRow,
      $$SessionEventsTableFilterComposer,
      $$SessionEventsTableOrderingComposer,
      $$SessionEventsTableAnnotationComposer,
      $$SessionEventsTableCreateCompanionBuilder,
      $$SessionEventsTableUpdateCompanionBuilder,
      (SessionEventRow, $$SessionEventsTableReferences),
      SessionEventRow,
      PrefetchHooks Function({bool sessionId})
    >;
typedef $$CapturesTableCreateCompanionBuilder = CapturesCompanion Function({
  required String sha256,
  required String sessionId,
  required String kind,
  required String sensor,
  required String mediaType,
  required int byteSize,
  required String localPath,
  required String subjectType,
  required String subjectId,
  Value<String?> slotCode,
  required String shotCode,
  required DateTime capturedAt,
  required int gpsTimeMs,
  required String timeSource,
  Value<String?> qcVerdict,
  Value<String?> qcVersion,
  Value<double?> qcSharpness,
  Value<double?> qcBrightness,
  Value<double?> qcDarkRatio,
  Value<double?> qcBrightRatio,
  Value<String?> qcFindings,
  Value<int> rowid,
});
typedef $$CapturesTableUpdateCompanionBuilder = CapturesCompanion Function({
  Value<String> sha256,
  Value<String> sessionId,
  Value<String> kind,
  Value<String> sensor,
  Value<String> mediaType,
  Value<int> byteSize,
  Value<String> localPath,
  Value<String> subjectType,
  Value<String> subjectId,
  Value<String?> slotCode,
  Value<String> shotCode,
  Value<DateTime> capturedAt,
  Value<int> gpsTimeMs,
  Value<String> timeSource,
  Value<String?> qcVerdict,
  Value<String?> qcVersion,
  Value<double?> qcSharpness,
  Value<double?> qcBrightness,
  Value<double?> qcDarkRatio,
  Value<double?> qcBrightRatio,
  Value<String?> qcFindings,
  Value<int> rowid,
});

final class $$CapturesTableReferences
    extends BaseReferences<_$AppDatabase, $CapturesTable, CaptureRow> {
  $$CapturesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $SessionsTable _sessionIdTable(_$AppDatabase db) =>
      db.sessions.createAlias('captures__session_id__sessions__id');

  $$SessionsTableProcessedTableManager get sessionId {
    final $_column = $_itemColumn<String>('session_id')!;

    final manager = $$SessionsTableTableManager(
      $_db,
      $_db.sessions,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sessionIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$CapturesTableFilterComposer
    extends Composer<_$AppDatabase, $CapturesTable> {
  $$CapturesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sensor => $composableBuilder(
    column: $table.sensor,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get byteSize => $composableBuilder(
    column: $table.byteSize,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get subjectId => $composableBuilder(
    column: $table.subjectId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get slotCode => $composableBuilder(
    column: $table.slotCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get shotCode => $composableBuilder(
    column: $table.shotCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get gpsTimeMs => $composableBuilder(
    column: $table.gpsTimeMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get qcVerdict => $composableBuilder(
    column: $table.qcVerdict,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get qcVersion => $composableBuilder(
    column: $table.qcVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get qcSharpness => $composableBuilder(
    column: $table.qcSharpness,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get qcBrightness => $composableBuilder(
    column: $table.qcBrightness,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get qcDarkRatio => $composableBuilder(
    column: $table.qcDarkRatio,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get qcBrightRatio => $composableBuilder(
    column: $table.qcBrightRatio,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get qcFindings => $composableBuilder(
    column: $table.qcFindings,
    builder: (column) => ColumnFilters(column),
  );

  $$SessionsTableFilterComposer get sessionId {
    final $$SessionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableFilterComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CapturesTableOrderingComposer
    extends Composer<_$AppDatabase, $CapturesTable> {
  $$CapturesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get sha256 => $composableBuilder(
    column: $table.sha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sensor => $composableBuilder(
    column: $table.sensor,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get byteSize => $composableBuilder(
    column: $table.byteSize,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get localPath => $composableBuilder(
    column: $table.localPath,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get subjectId => $composableBuilder(
    column: $table.subjectId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get slotCode => $composableBuilder(
    column: $table.slotCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get shotCode => $composableBuilder(
    column: $table.shotCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get gpsTimeMs => $composableBuilder(
    column: $table.gpsTimeMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get qcVerdict => $composableBuilder(
    column: $table.qcVerdict,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get qcVersion => $composableBuilder(
    column: $table.qcVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get qcSharpness => $composableBuilder(
    column: $table.qcSharpness,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get qcBrightness => $composableBuilder(
    column: $table.qcBrightness,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get qcDarkRatio => $composableBuilder(
    column: $table.qcDarkRatio,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get qcBrightRatio => $composableBuilder(
    column: $table.qcBrightRatio,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get qcFindings => $composableBuilder(
    column: $table.qcFindings,
    builder: (column) => ColumnOrderings(column),
  );

  $$SessionsTableOrderingComposer get sessionId {
    final $$SessionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableOrderingComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CapturesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CapturesTable> {
  $$CapturesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get sensor =>
      $composableBuilder(column: $table.sensor, builder: (column) => column);

  GeneratedColumn<String> get mediaType =>
      $composableBuilder(column: $table.mediaType, builder: (column) => column);

  GeneratedColumn<int> get byteSize =>
      $composableBuilder(column: $table.byteSize, builder: (column) => column);

  GeneratedColumn<String> get localPath =>
      $composableBuilder(column: $table.localPath, builder: (column) => column);

  GeneratedColumn<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get subjectId =>
      $composableBuilder(column: $table.subjectId, builder: (column) => column);

  GeneratedColumn<String> get slotCode =>
      $composableBuilder(column: $table.slotCode, builder: (column) => column);

  GeneratedColumn<String> get shotCode =>
      $composableBuilder(column: $table.shotCode, builder: (column) => column);

  GeneratedColumn<DateTime> get capturedAt => $composableBuilder(
    column: $table.capturedAt,
    builder: (column) => column,
  );

  GeneratedColumn<int> get gpsTimeMs =>
      $composableBuilder(column: $table.gpsTimeMs, builder: (column) => column);

  GeneratedColumn<String> get timeSource => $composableBuilder(
    column: $table.timeSource,
    builder: (column) => column,
  );

  GeneratedColumn<String> get qcVerdict =>
      $composableBuilder(column: $table.qcVerdict, builder: (column) => column);

  GeneratedColumn<String> get qcVersion =>
      $composableBuilder(column: $table.qcVersion, builder: (column) => column);

  GeneratedColumn<double> get qcSharpness => $composableBuilder(
    column: $table.qcSharpness,
    builder: (column) => column,
  );

  GeneratedColumn<double> get qcBrightness => $composableBuilder(
    column: $table.qcBrightness,
    builder: (column) => column,
  );

  GeneratedColumn<double> get qcDarkRatio => $composableBuilder(
    column: $table.qcDarkRatio,
    builder: (column) => column,
  );

  GeneratedColumn<double> get qcBrightRatio => $composableBuilder(
    column: $table.qcBrightRatio,
    builder: (column) => column,
  );

  GeneratedColumn<String> get qcFindings => $composableBuilder(
    column: $table.qcFindings,
    builder: (column) => column,
  );

  $$SessionsTableAnnotationComposer get sessionId {
    final $$SessionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CapturesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CapturesTable,
          CaptureRow,
          $$CapturesTableFilterComposer,
          $$CapturesTableOrderingComposer,
          $$CapturesTableAnnotationComposer,
          $$CapturesTableCreateCompanionBuilder,
          $$CapturesTableUpdateCompanionBuilder,
          (CaptureRow, $$CapturesTableReferences),
          CaptureRow,
          PrefetchHooks Function({bool sessionId})
        > {
  $$CapturesTableTableManager(_$AppDatabase db, $CapturesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CapturesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CapturesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CapturesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> sha256 = const Value.absent(),
                Value<String> sessionId = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> sensor = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<int> byteSize = const Value.absent(),
                Value<String> localPath = const Value.absent(),
                Value<String> subjectType = const Value.absent(),
                Value<String> subjectId = const Value.absent(),
                Value<String?> slotCode = const Value.absent(),
                Value<String> shotCode = const Value.absent(),
                Value<DateTime> capturedAt = const Value.absent(),
                Value<int> gpsTimeMs = const Value.absent(),
                Value<String> timeSource = const Value.absent(),
                Value<String?> qcVerdict = const Value.absent(),
                Value<String?> qcVersion = const Value.absent(),
                Value<double?> qcSharpness = const Value.absent(),
                Value<double?> qcBrightness = const Value.absent(),
                Value<double?> qcDarkRatio = const Value.absent(),
                Value<double?> qcBrightRatio = const Value.absent(),
                Value<String?> qcFindings = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CapturesCompanion(
                sha256: sha256,
                sessionId: sessionId,
                kind: kind,
                sensor: sensor,
                mediaType: mediaType,
                byteSize: byteSize,
                localPath: localPath,
                subjectType: subjectType,
                subjectId: subjectId,
                slotCode: slotCode,
                shotCode: shotCode,
                capturedAt: capturedAt,
                gpsTimeMs: gpsTimeMs,
                timeSource: timeSource,
                qcVerdict: qcVerdict,
                qcVersion: qcVersion,
                qcSharpness: qcSharpness,
                qcBrightness: qcBrightness,
                qcDarkRatio: qcDarkRatio,
                qcBrightRatio: qcBrightRatio,
                qcFindings: qcFindings,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String sha256,
                required String sessionId,
                required String kind,
                required String sensor,
                required String mediaType,
                required int byteSize,
                required String localPath,
                required String subjectType,
                required String subjectId,
                Value<String?> slotCode = const Value.absent(),
                required String shotCode,
                required DateTime capturedAt,
                required int gpsTimeMs,
                required String timeSource,
                Value<String?> qcVerdict = const Value.absent(),
                Value<String?> qcVersion = const Value.absent(),
                Value<double?> qcSharpness = const Value.absent(),
                Value<double?> qcBrightness = const Value.absent(),
                Value<double?> qcDarkRatio = const Value.absent(),
                Value<double?> qcBrightRatio = const Value.absent(),
                Value<String?> qcFindings = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CapturesCompanion.insert(
                sha256: sha256,
                sessionId: sessionId,
                kind: kind,
                sensor: sensor,
                mediaType: mediaType,
                byteSize: byteSize,
                localPath: localPath,
                subjectType: subjectType,
                subjectId: subjectId,
                slotCode: slotCode,
                shotCode: shotCode,
                capturedAt: capturedAt,
                gpsTimeMs: gpsTimeMs,
                timeSource: timeSource,
                qcVerdict: qcVerdict,
                qcVersion: qcVersion,
                qcSharpness: qcSharpness,
                qcBrightness: qcBrightness,
                qcDarkRatio: qcDarkRatio,
                qcBrightRatio: qcBrightRatio,
                qcFindings: qcFindings,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CapturesTable, CaptureRow>(table),
                  $$CapturesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({sessionId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (sessionId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.sessionId,
                        referencedTable: $$CapturesTableReferences
                            ._sessionIdTable(db),
                        referencedColumn: $$CapturesTableReferences
                            ._sessionIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$CapturesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CapturesTable,
      CaptureRow,
      $$CapturesTableFilterComposer,
      $$CapturesTableOrderingComposer,
      $$CapturesTableAnnotationComposer,
      $$CapturesTableCreateCompanionBuilder,
      $$CapturesTableUpdateCompanionBuilder,
      (CaptureRow, $$CapturesTableReferences),
      CaptureRow,
      PrefetchHooks Function({bool sessionId})
    >;
typedef $$MeasurementsTableCreateCompanionBuilder =
    MeasurementsCompanion Function({
      required String id,
      required String sessionId,
      required String subjectType,
      required String subjectId,
      required String metricCode,
      Value<bool?> valueBoolean,
      Value<double?> valueNum,
      Value<String?> valueText,
      Value<String?> unit,
      Value<double?> uncertainty,
      required String method,
      required String methodVersion,
      required String source,
      required DateTime measuredAt,
      required String evidenceJson,
      Value<int> rowid,
    });
typedef $$MeasurementsTableUpdateCompanionBuilder =
    MeasurementsCompanion Function({
      Value<String> id,
      Value<String> sessionId,
      Value<String> subjectType,
      Value<String> subjectId,
      Value<String> metricCode,
      Value<bool?> valueBoolean,
      Value<double?> valueNum,
      Value<String?> valueText,
      Value<String?> unit,
      Value<double?> uncertainty,
      Value<String> method,
      Value<String> methodVersion,
      Value<String> source,
      Value<DateTime> measuredAt,
      Value<String> evidenceJson,
      Value<int> rowid,
    });

final class $$MeasurementsTableReferences
    extends BaseReferences<_$AppDatabase, $MeasurementsTable, MeasurementRow> {
  $$MeasurementsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $SessionsTable _sessionIdTable(_$AppDatabase db) =>
      db.sessions.createAlias('measurements__session_id__sessions__id');

  $$SessionsTableProcessedTableManager get sessionId {
    final $_column = $_itemColumn<String>('session_id')!;

    final manager = $$SessionsTableTableManager(
      $_db,
      $_db.sessions,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sessionIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$MeasurementsTableFilterComposer
    extends Composer<_$AppDatabase, $MeasurementsTable> {
  $$MeasurementsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get subjectId => $composableBuilder(
    column: $table.subjectId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get metricCode => $composableBuilder(
    column: $table.metricCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get valueBoolean => $composableBuilder(
    column: $table.valueBoolean,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get valueNum => $composableBuilder(
    column: $table.valueNum,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get valueText => $composableBuilder(
    column: $table.valueText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get unit => $composableBuilder(
    column: $table.unit,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get uncertainty => $composableBuilder(
    column: $table.uncertainty,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get method => $composableBuilder(
    column: $table.method,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get methodVersion => $composableBuilder(
    column: $table.methodVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get measuredAt => $composableBuilder(
    column: $table.measuredAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get evidenceJson => $composableBuilder(
    column: $table.evidenceJson,
    builder: (column) => ColumnFilters(column),
  );

  $$SessionsTableFilterComposer get sessionId {
    final $$SessionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableFilterComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$MeasurementsTableOrderingComposer
    extends Composer<_$AppDatabase, $MeasurementsTable> {
  $$MeasurementsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get subjectId => $composableBuilder(
    column: $table.subjectId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get metricCode => $composableBuilder(
    column: $table.metricCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get valueBoolean => $composableBuilder(
    column: $table.valueBoolean,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get valueNum => $composableBuilder(
    column: $table.valueNum,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get valueText => $composableBuilder(
    column: $table.valueText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get unit => $composableBuilder(
    column: $table.unit,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get uncertainty => $composableBuilder(
    column: $table.uncertainty,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get method => $composableBuilder(
    column: $table.method,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get methodVersion => $composableBuilder(
    column: $table.methodVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get source => $composableBuilder(
    column: $table.source,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get measuredAt => $composableBuilder(
    column: $table.measuredAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get evidenceJson => $composableBuilder(
    column: $table.evidenceJson,
    builder: (column) => ColumnOrderings(column),
  );

  $$SessionsTableOrderingComposer get sessionId {
    final $$SessionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableOrderingComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$MeasurementsTableAnnotationComposer
    extends Composer<_$AppDatabase, $MeasurementsTable> {
  $$MeasurementsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get subjectType => $composableBuilder(
    column: $table.subjectType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get subjectId =>
      $composableBuilder(column: $table.subjectId, builder: (column) => column);

  GeneratedColumn<String> get metricCode => $composableBuilder(
    column: $table.metricCode,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get valueBoolean => $composableBuilder(
    column: $table.valueBoolean,
    builder: (column) => column,
  );

  GeneratedColumn<double> get valueNum =>
      $composableBuilder(column: $table.valueNum, builder: (column) => column);

  GeneratedColumn<String> get valueText =>
      $composableBuilder(column: $table.valueText, builder: (column) => column);

  GeneratedColumn<String> get unit =>
      $composableBuilder(column: $table.unit, builder: (column) => column);

  GeneratedColumn<double> get uncertainty => $composableBuilder(
    column: $table.uncertainty,
    builder: (column) => column,
  );

  GeneratedColumn<String> get method =>
      $composableBuilder(column: $table.method, builder: (column) => column);

  GeneratedColumn<String> get methodVersion => $composableBuilder(
    column: $table.methodVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<DateTime> get measuredAt => $composableBuilder(
    column: $table.measuredAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get evidenceJson => $composableBuilder(
    column: $table.evidenceJson,
    builder: (column) => column,
  );

  $$SessionsTableAnnotationComposer get sessionId {
    final $$SessionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$MeasurementsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $MeasurementsTable,
          MeasurementRow,
          $$MeasurementsTableFilterComposer,
          $$MeasurementsTableOrderingComposer,
          $$MeasurementsTableAnnotationComposer,
          $$MeasurementsTableCreateCompanionBuilder,
          $$MeasurementsTableUpdateCompanionBuilder,
          (MeasurementRow, $$MeasurementsTableReferences),
          MeasurementRow,
          PrefetchHooks Function({bool sessionId})
        > {
  $$MeasurementsTableTableManager(_$AppDatabase db, $MeasurementsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MeasurementsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MeasurementsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MeasurementsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> sessionId = const Value.absent(),
                Value<String> subjectType = const Value.absent(),
                Value<String> subjectId = const Value.absent(),
                Value<String> metricCode = const Value.absent(),
                Value<bool?> valueBoolean = const Value.absent(),
                Value<double?> valueNum = const Value.absent(),
                Value<String?> valueText = const Value.absent(),
                Value<String?> unit = const Value.absent(),
                Value<double?> uncertainty = const Value.absent(),
                Value<String> method = const Value.absent(),
                Value<String> methodVersion = const Value.absent(),
                Value<String> source = const Value.absent(),
                Value<DateTime> measuredAt = const Value.absent(),
                Value<String> evidenceJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MeasurementsCompanion(
                id: id,
                sessionId: sessionId,
                subjectType: subjectType,
                subjectId: subjectId,
                metricCode: metricCode,
                valueBoolean: valueBoolean,
                valueNum: valueNum,
                valueText: valueText,
                unit: unit,
                uncertainty: uncertainty,
                method: method,
                methodVersion: methodVersion,
                source: source,
                measuredAt: measuredAt,
                evidenceJson: evidenceJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String sessionId,
                required String subjectType,
                required String subjectId,
                required String metricCode,
                Value<bool?> valueBoolean = const Value.absent(),
                Value<double?> valueNum = const Value.absent(),
                Value<String?> valueText = const Value.absent(),
                Value<String?> unit = const Value.absent(),
                Value<double?> uncertainty = const Value.absent(),
                required String method,
                required String methodVersion,
                required String source,
                required DateTime measuredAt,
                required String evidenceJson,
                Value<int> rowid = const Value.absent(),
              }) => MeasurementsCompanion.insert(
                id: id,
                sessionId: sessionId,
                subjectType: subjectType,
                subjectId: subjectId,
                metricCode: metricCode,
                valueBoolean: valueBoolean,
                valueNum: valueNum,
                valueText: valueText,
                unit: unit,
                uncertainty: uncertainty,
                method: method,
                methodVersion: methodVersion,
                source: source,
                measuredAt: measuredAt,
                evidenceJson: evidenceJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$MeasurementsTable, MeasurementRow>(table),
                  $$MeasurementsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({sessionId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (sessionId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.sessionId,
                        referencedTable: $$MeasurementsTableReferences
                            ._sessionIdTable(db),
                        referencedColumn: $$MeasurementsTableReferences
                            ._sessionIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$MeasurementsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $MeasurementsTable,
      MeasurementRow,
      $$MeasurementsTableFilterComposer,
      $$MeasurementsTableOrderingComposer,
      $$MeasurementsTableAnnotationComposer,
      $$MeasurementsTableCreateCompanionBuilder,
      $$MeasurementsTableUpdateCompanionBuilder,
      (MeasurementRow, $$MeasurementsTableReferences),
      MeasurementRow,
      PrefetchHooks Function({bool sessionId})
    >;
typedef $$OutboxEntriesTableCreateCompanionBuilder =
    OutboxEntriesCompanion Function({
      Value<int> id,
      required String entityType,
      required String entityId,
      required DateTime createdAt,
      Value<int> attempts,
      Value<String?> lastError,
      Value<DateTime?> lastAttemptAt,
      Value<DateTime?> sentAt,
      Value<DateTime?> failedAt,
    });
typedef $$OutboxEntriesTableUpdateCompanionBuilder =
    OutboxEntriesCompanion Function({
      Value<int> id,
      Value<String> entityType,
      Value<String> entityId,
      Value<DateTime> createdAt,
      Value<int> attempts,
      Value<String?> lastError,
      Value<DateTime?> lastAttemptAt,
      Value<DateTime?> sentAt,
      Value<DateTime?> failedAt,
    });

class $$OutboxEntriesTableFilterComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get sentAt => $composableBuilder(
    column: $table.sentAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get failedAt => $composableBuilder(
    column: $table.failedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxEntriesTableOrderingComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get sentAt => $composableBuilder(
    column: $table.sentAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get failedAt => $composableBuilder(
    column: $table.failedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxEntriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get sentAt =>
      $composableBuilder(column: $table.sentAt, builder: (column) => column);

  GeneratedColumn<DateTime> get failedAt =>
      $composableBuilder(column: $table.failedAt, builder: (column) => column);
}

class $$OutboxEntriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OutboxEntriesTable,
          OutboxEntry,
          $$OutboxEntriesTableFilterComposer,
          $$OutboxEntriesTableOrderingComposer,
          $$OutboxEntriesTableAnnotationComposer,
          $$OutboxEntriesTableCreateCompanionBuilder,
          $$OutboxEntriesTableUpdateCompanionBuilder,
          (
            OutboxEntry,
            BaseReferences<_$AppDatabase, $OutboxEntriesTable, OutboxEntry>,
          ),
          OutboxEntry,
          PrefetchHooks Function()
        > {
  $$OutboxEntriesTableTableManager(_$AppDatabase db, $OutboxEntriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxEntriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxEntriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxEntriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String> entityId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<DateTime?> sentAt = const Value.absent(),
                Value<DateTime?> failedAt = const Value.absent(),
              }) => OutboxEntriesCompanion(
                id: id,
                entityType: entityType,
                entityId: entityId,
                createdAt: createdAt,
                attempts: attempts,
                lastError: lastError,
                lastAttemptAt: lastAttemptAt,
                sentAt: sentAt,
                failedAt: failedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String entityType,
                required String entityId,
                required DateTime createdAt,
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<DateTime?> sentAt = const Value.absent(),
                Value<DateTime?> failedAt = const Value.absent(),
              }) => OutboxEntriesCompanion.insert(
                id: id,
                entityType: entityType,
                entityId: entityId,
                createdAt: createdAt,
                attempts: attempts,
                lastError: lastError,
                lastAttemptAt: lastAttemptAt,
                sentAt: sentAt,
                failedAt: failedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OutboxEntriesTable, OutboxEntry>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $OutboxEntriesTable,
                    OutboxEntry
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxEntriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OutboxEntriesTable,
      OutboxEntry,
      $$OutboxEntriesTableFilterComposer,
      $$OutboxEntriesTableOrderingComposer,
      $$OutboxEntriesTableAnnotationComposer,
      $$OutboxEntriesTableCreateCompanionBuilder,
      $$OutboxEntriesTableUpdateCompanionBuilder,
      (
        OutboxEntry,
        BaseReferences<_$AppDatabase, $OutboxEntriesTable, OutboxEntry>,
      ),
      OutboxEntry,
      PrefetchHooks Function()
    >;
typedef $$TaskCacheTableCreateCompanionBuilder = TaskCacheCompanion Function({
  required String userId,
  required String tasksJson,
  required DateTime fetchedAt,
  Value<int> rowid,
});
typedef $$TaskCacheTableUpdateCompanionBuilder = TaskCacheCompanion Function({
  Value<String> userId,
  Value<String> tasksJson,
  Value<DateTime> fetchedAt,
  Value<int> rowid,
});

class $$TaskCacheTableFilterComposer
    extends Composer<_$AppDatabase, $TaskCacheTable> {
  $$TaskCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tasksJson => $composableBuilder(
    column: $table.tasksJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
    column: $table.fetchedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TaskCacheTableOrderingComposer
    extends Composer<_$AppDatabase, $TaskCacheTable> {
  $$TaskCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tasksJson => $composableBuilder(
    column: $table.tasksJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
    column: $table.fetchedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TaskCacheTableAnnotationComposer
    extends Composer<_$AppDatabase, $TaskCacheTable> {
  $$TaskCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get tasksJson =>
      $composableBuilder(column: $table.tasksJson, builder: (column) => column);

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$TaskCacheTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TaskCacheTable,
          TaskCacheRow,
          $$TaskCacheTableFilterComposer,
          $$TaskCacheTableOrderingComposer,
          $$TaskCacheTableAnnotationComposer,
          $$TaskCacheTableCreateCompanionBuilder,
          $$TaskCacheTableUpdateCompanionBuilder,
          (
            TaskCacheRow,
            BaseReferences<_$AppDatabase, $TaskCacheTable, TaskCacheRow>,
          ),
          TaskCacheRow,
          PrefetchHooks Function()
        > {
  $$TaskCacheTableTableManager(_$AppDatabase db, $TaskCacheTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TaskCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TaskCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TaskCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> userId = const Value.absent(),
                Value<String> tasksJson = const Value.absent(),
                Value<DateTime> fetchedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TaskCacheCompanion(
                userId: userId,
                tasksJson: tasksJson,
                fetchedAt: fetchedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String userId,
                required String tasksJson,
                required DateTime fetchedAt,
                Value<int> rowid = const Value.absent(),
              }) => TaskCacheCompanion.insert(
                userId: userId,
                tasksJson: tasksJson,
                fetchedAt: fetchedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$TaskCacheTable, TaskCacheRow>(table),
                  BaseReferences<_$AppDatabase, $TaskCacheTable, TaskCacheRow>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TaskCacheTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TaskCacheTable,
      TaskCacheRow,
      $$TaskCacheTableFilterComposer,
      $$TaskCacheTableOrderingComposer,
      $$TaskCacheTableAnnotationComposer,
      $$TaskCacheTableCreateCompanionBuilder,
      $$TaskCacheTableUpdateCompanionBuilder,
      (
        TaskCacheRow,
        BaseReferences<_$AppDatabase, $TaskCacheTable, TaskCacheRow>,
      ),
      TaskCacheRow,
      PrefetchHooks Function()
    >;
typedef $$VerificationResultsTableCreateCompanionBuilder =
    VerificationResultsCompanion Function({
      required String id,
      required String tourId,
      required String itemId,
      required String slotCode,
      required bool treePresent,
      Value<String?> note,
      Value<String?> captureSha256,
      required DateTime recordedAt,
      Value<int> rowid,
    });
typedef $$VerificationResultsTableUpdateCompanionBuilder =
    VerificationResultsCompanion Function({
      Value<String> id,
      Value<String> tourId,
      Value<String> itemId,
      Value<String> slotCode,
      Value<bool> treePresent,
      Value<String?> note,
      Value<String?> captureSha256,
      Value<DateTime> recordedAt,
      Value<int> rowid,
    });

final class $$VerificationResultsTableReferences
    extends
        BaseReferences<
          _$AppDatabase,
          $VerificationResultsTable,
          VerificationResultRow
        > {
  $$VerificationResultsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $SessionsTable _tourIdTable(_$AppDatabase db) =>
      db.sessions.createAlias('verification_results__tour_id__sessions__id');

  $$SessionsTableProcessedTableManager get tourId {
    final $_column = $_itemColumn<String>('tour_id')!;

    final manager = $$SessionsTableTableManager(
      $_db,
      $_db.sessions,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_tourIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$VerificationResultsTableFilterComposer
    extends Composer<_$AppDatabase, $VerificationResultsTable> {
  $$VerificationResultsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get itemId => $composableBuilder(
    column: $table.itemId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get slotCode => $composableBuilder(
    column: $table.slotCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get treePresent => $composableBuilder(
    column: $table.treePresent,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get captureSha256 => $composableBuilder(
    column: $table.captureSha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$SessionsTableFilterComposer get tourId {
    final $$SessionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tourId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableFilterComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$VerificationResultsTableOrderingComposer
    extends Composer<_$AppDatabase, $VerificationResultsTable> {
  $$VerificationResultsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get itemId => $composableBuilder(
    column: $table.itemId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get slotCode => $composableBuilder(
    column: $table.slotCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get treePresent => $composableBuilder(
    column: $table.treePresent,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get captureSha256 => $composableBuilder(
    column: $table.captureSha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$SessionsTableOrderingComposer get tourId {
    final $$SessionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tourId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableOrderingComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$VerificationResultsTableAnnotationComposer
    extends Composer<_$AppDatabase, $VerificationResultsTable> {
  $$VerificationResultsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => column);

  GeneratedColumn<String> get slotCode =>
      $composableBuilder(column: $table.slotCode, builder: (column) => column);

  GeneratedColumn<bool> get treePresent => $composableBuilder(
    column: $table.treePresent,
    builder: (column) => column,
  );

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get captureSha256 => $composableBuilder(
    column: $table.captureSha256,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get recordedAt => $composableBuilder(
    column: $table.recordedAt,
    builder: (column) => column,
  );

  $$SessionsTableAnnotationComposer get tourId {
    final $$SessionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tourId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$VerificationResultsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $VerificationResultsTable,
          VerificationResultRow,
          $$VerificationResultsTableFilterComposer,
          $$VerificationResultsTableOrderingComposer,
          $$VerificationResultsTableAnnotationComposer,
          $$VerificationResultsTableCreateCompanionBuilder,
          $$VerificationResultsTableUpdateCompanionBuilder,
          (VerificationResultRow, $$VerificationResultsTableReferences),
          VerificationResultRow,
          PrefetchHooks Function({bool tourId})
        > {
  $$VerificationResultsTableTableManager(
    _$AppDatabase db,
    $VerificationResultsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$VerificationResultsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$VerificationResultsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$VerificationResultsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> tourId = const Value.absent(),
                Value<String> itemId = const Value.absent(),
                Value<String> slotCode = const Value.absent(),
                Value<bool> treePresent = const Value.absent(),
                Value<String?> note = const Value.absent(),
                Value<String?> captureSha256 = const Value.absent(),
                Value<DateTime> recordedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => VerificationResultsCompanion(
                id: id,
                tourId: tourId,
                itemId: itemId,
                slotCode: slotCode,
                treePresent: treePresent,
                note: note,
                captureSha256: captureSha256,
                recordedAt: recordedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String tourId,
                required String itemId,
                required String slotCode,
                required bool treePresent,
                Value<String?> note = const Value.absent(),
                Value<String?> captureSha256 = const Value.absent(),
                required DateTime recordedAt,
                Value<int> rowid = const Value.absent(),
              }) => VerificationResultsCompanion.insert(
                id: id,
                tourId: tourId,
                itemId: itemId,
                slotCode: slotCode,
                treePresent: treePresent,
                note: note,
                captureSha256: captureSha256,
                recordedAt: recordedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$VerificationResultsTable, VerificationResultRow>(
                    table,
                  ),
                  $$VerificationResultsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({tourId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (tourId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.tourId,
                        referencedTable: $$VerificationResultsTableReferences
                            ._tourIdTable(db),
                        referencedColumn: $$VerificationResultsTableReferences
                            ._tourIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$VerificationResultsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $VerificationResultsTable,
      VerificationResultRow,
      $$VerificationResultsTableFilterComposer,
      $$VerificationResultsTableOrderingComposer,
      $$VerificationResultsTableAnnotationComposer,
      $$VerificationResultsTableCreateCompanionBuilder,
      $$VerificationResultsTableUpdateCompanionBuilder,
      (VerificationResultRow, $$VerificationResultsTableReferences),
      VerificationResultRow,
      PrefetchHooks Function({bool tourId})
    >;
typedef $$ParcelRoutesTableCreateCompanionBuilder =
    ParcelRoutesCompanion Function({
      required String id,
      required String parcelId,
      required int version,
      required String contentHash,
      required String generator,
      required String basis,
      required String routeJson,
      required String sessionId,
      required DateTime createdAt,
      Value<bool> synced,
      Value<int> rowid,
    });
typedef $$ParcelRoutesTableUpdateCompanionBuilder =
    ParcelRoutesCompanion Function({
      Value<String> id,
      Value<String> parcelId,
      Value<int> version,
      Value<String> contentHash,
      Value<String> generator,
      Value<String> basis,
      Value<String> routeJson,
      Value<String> sessionId,
      Value<DateTime> createdAt,
      Value<bool> synced,
      Value<int> rowid,
    });

final class $$ParcelRoutesTableReferences
    extends BaseReferences<_$AppDatabase, $ParcelRoutesTable, ParcelRouteRow> {
  $$ParcelRoutesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $SessionsTable _sessionIdTable(_$AppDatabase db) =>
      db.sessions.createAlias('parcel_routes__session_id__sessions__id');

  $$SessionsTableProcessedTableManager get sessionId {
    final $_column = $_itemColumn<String>('session_id')!;

    final manager = $$SessionsTableTableManager(
      $_db,
      $_db.sessions,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sessionIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ParcelRoutesTableFilterComposer
    extends Composer<_$AppDatabase, $ParcelRoutesTable> {
  $$ParcelRoutesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parcelId => $composableBuilder(
    column: $table.parcelId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get generator => $composableBuilder(
    column: $table.generator,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get basis => $composableBuilder(
    column: $table.basis,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get routeJson => $composableBuilder(
    column: $table.routeJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get synced => $composableBuilder(
    column: $table.synced,
    builder: (column) => ColumnFilters(column),
  );

  $$SessionsTableFilterComposer get sessionId {
    final $$SessionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableFilterComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ParcelRoutesTableOrderingComposer
    extends Composer<_$AppDatabase, $ParcelRoutesTable> {
  $$ParcelRoutesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parcelId => $composableBuilder(
    column: $table.parcelId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get generator => $composableBuilder(
    column: $table.generator,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get basis => $composableBuilder(
    column: $table.basis,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get routeJson => $composableBuilder(
    column: $table.routeJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get synced => $composableBuilder(
    column: $table.synced,
    builder: (column) => ColumnOrderings(column),
  );

  $$SessionsTableOrderingComposer get sessionId {
    final $$SessionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableOrderingComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ParcelRoutesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ParcelRoutesTable> {
  $$ParcelRoutesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get parcelId =>
      $composableBuilder(column: $table.parcelId, builder: (column) => column);

  GeneratedColumn<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => column);

  GeneratedColumn<String> get contentHash => $composableBuilder(
    column: $table.contentHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get generator =>
      $composableBuilder(column: $table.generator, builder: (column) => column);

  GeneratedColumn<String> get basis =>
      $composableBuilder(column: $table.basis, builder: (column) => column);

  GeneratedColumn<String> get routeJson =>
      $composableBuilder(column: $table.routeJson, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<bool> get synced =>
      $composableBuilder(column: $table.synced, builder: (column) => column);

  $$SessionsTableAnnotationComposer get sessionId {
    final $$SessionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionId,
      referencedTable: $db.sessions,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessions,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ParcelRoutesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ParcelRoutesTable,
          ParcelRouteRow,
          $$ParcelRoutesTableFilterComposer,
          $$ParcelRoutesTableOrderingComposer,
          $$ParcelRoutesTableAnnotationComposer,
          $$ParcelRoutesTableCreateCompanionBuilder,
          $$ParcelRoutesTableUpdateCompanionBuilder,
          (ParcelRouteRow, $$ParcelRoutesTableReferences),
          ParcelRouteRow,
          PrefetchHooks Function({bool sessionId})
        > {
  $$ParcelRoutesTableTableManager(_$AppDatabase db, $ParcelRoutesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ParcelRoutesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ParcelRoutesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ParcelRoutesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> parcelId = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<String> contentHash = const Value.absent(),
                Value<String> generator = const Value.absent(),
                Value<String> basis = const Value.absent(),
                Value<String> routeJson = const Value.absent(),
                Value<String> sessionId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<bool> synced = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ParcelRoutesCompanion(
                id: id,
                parcelId: parcelId,
                version: version,
                contentHash: contentHash,
                generator: generator,
                basis: basis,
                routeJson: routeJson,
                sessionId: sessionId,
                createdAt: createdAt,
                synced: synced,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String parcelId,
                required int version,
                required String contentHash,
                required String generator,
                required String basis,
                required String routeJson,
                required String sessionId,
                required DateTime createdAt,
                Value<bool> synced = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ParcelRoutesCompanion.insert(
                id: id,
                parcelId: parcelId,
                version: version,
                contentHash: contentHash,
                generator: generator,
                basis: basis,
                routeJson: routeJson,
                sessionId: sessionId,
                createdAt: createdAt,
                synced: synced,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ParcelRoutesTable, ParcelRouteRow>(table),
                  $$ParcelRoutesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({sessionId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (sessionId) {
                      state = state.withJoin(
                        currentTable: table,
                        currentColumn: table.sessionId,
                        referencedTable: $$ParcelRoutesTableReferences
                            ._sessionIdTable(db),
                        referencedColumn: $$ParcelRoutesTableReferences
                            ._sessionIdTable(db)
                            .id,
                      ) as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ParcelRoutesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ParcelRoutesTable,
      ParcelRouteRow,
      $$ParcelRoutesTableFilterComposer,
      $$ParcelRoutesTableOrderingComposer,
      $$ParcelRoutesTableAnnotationComposer,
      $$ParcelRoutesTableCreateCompanionBuilder,
      $$ParcelRoutesTableUpdateCompanionBuilder,
      (ParcelRouteRow, $$ParcelRoutesTableReferences),
      ParcelRouteRow,
      PrefetchHooks Function({bool sessionId})
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$SessionsTableTableManager get sessions =>
      $$SessionsTableTableManager(_db, _db.sessions);
  $$SessionEventsTableTableManager get sessionEvents =>
      $$SessionEventsTableTableManager(_db, _db.sessionEvents);
  $$CapturesTableTableManager get captures =>
      $$CapturesTableTableManager(_db, _db.captures);
  $$MeasurementsTableTableManager get measurements =>
      $$MeasurementsTableTableManager(_db, _db.measurements);
  $$OutboxEntriesTableTableManager get outboxEntries =>
      $$OutboxEntriesTableTableManager(_db, _db.outboxEntries);
  $$TaskCacheTableTableManager get taskCache =>
      $$TaskCacheTableTableManager(_db, _db.taskCache);
  $$VerificationResultsTableTableManager get verificationResults =>
      $$VerificationResultsTableTableManager(_db, _db.verificationResults);
  $$ParcelRoutesTableTableManager get parcelRoutes =>
      $$ParcelRoutesTableTableManager(_db, _db.parcelRoutes);
}
