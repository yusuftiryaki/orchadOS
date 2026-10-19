import 'field_task.dart';

/// Source of today's tasks. Will be served from Supabase once sync exists.
abstract interface class TaskRepository {
  Future<List<FieldTask>> todaysTasks();
}

/// Fixed sample tasks for development and tests.
class FakeTaskRepository implements TaskRepository {
  const FakeTaskRepository();

  static const List<FieldTask> sampleTasks = [
    FieldTask(
      id: 'task-1',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
      parcelName: 'Kızılburç P-12',
      village: 'Kızılburç',
      kind: VisitKind.periodic,
      season: Season.winter,
      areaDecare: 20,
      closeupTrees: [
        TreeTarget(
          treeId: 't-0512',
          slotCode: 'S5-12',
          reason: 'Önceki ziyarette Dikkat',
        ),
        TreeTarget(
          treeId: 't-0703',
          slotCode: 'S7-3',
          reason: 'Rastgele örneklem',
        ),
        TreeTarget(
          treeId: 't-0921',
          slotCode: 'S9-21a',
          reason: 'Taramada sorun işaretlendi',
        ),
      ],
    ),
    FieldTask(
      id: 'task-2',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000031',
      parcelName: 'Yukarıbayır P-31',
      village: 'Yukarıbayır',
      kind: VisitKind.inventory,
      season: Season.winter,
      areaDecare: 14.5,
      closeupTrees: [
        TreeTarget(
          treeId: 't-3101',
          slotCode: 'S1-4',
          reason: 'Doğrulama: belirsiz ağaç',
        ),
      ],
    ),
  ];

  @override
  Future<List<FieldTask>> todaysTasks() async => sampleTasks;
}
