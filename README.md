# logseq-plugin-agenda
> A calendar plugin for logseq

This is the [fecton fork](https://github.com/fecton/logseq-plugin-agenda) of [haydenull's Agenda](https://github.com/haydenull/logseq-plugin-agenda), including scheduled task-end notifications. Installable ZIP packages are available in this fork's [releases](https://github.com/fecton/logseq-plugin-agenda/releases).

The fork appears as **Agenda (fecton)** and uses the plugin ID `logseq-agenda-fecton`. Its distinct ID keeps Logseq's marketplace updater from replacing it with the upstream plugin. When replacing an existing Agenda installation, preserve its settings and layout files under the new ID and remove the old plugin from the active plugins directory. Then enable task-end notifications in General Settings. Existing graph tasks do not need conversion.

[![latest release version](https://img.shields.io/github/v/release/haydenull/logseq-plugin-agenda)](https://github.com/haydenull/logseq-plugin-agenda/releases)
[![License](https://img.shields.io/github/license/haydenull/logseq-plugin-agenda?color=blue)](https://github.com/haydenull/logseq-plugin-agenda/blob/main/LICENSE)

To access the documentation, please refer to the following links based on the version you are using.

For version 2.0, you can find the documentation at https://haydenull.github.io/logseq-plugin-agenda/.

If you are using version 3.0, please visit https://haydenut.notion.site/Agenda3-ef115e277c864de3b2679d6bda0e6376 for the documentation

If you want to contribute, please visit [contribution guide](./CONTRIBUTING.md)

<a href="https://www.buymeacoffee.com/haydenull"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=haydenull&button_colour=40DCA5&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00" /></a>

<a href="https://afdian.net/a/haydenull"><img width="235" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.jpg"/></a>

## 🎨 Features
- Supports Kanban
- Supports Calendar
- Supports agenda sharing
- Supports use as a webpage or plugin
<!-- - Supports dashboard
- Supports sidebar
- Supports dark mode
- Supports calendar view
- Supports gantt view
- Supports timeline view
- Supports subscription calendar(basic event)
- Supports pomodoro timer -->

![kanban](./screenshots/agenda3-kanban.jpeg)
![calendar-month](./screenshots/agenda3-calendar-month.jpeg)
![calendar-week](./screenshots/agenda3-calendar-week.jpeg)
![ics](./screenshots/agenda3-ics.png)
<!-- ![dashboard-light](./screenshots/dashboard-light.png)
![dashboard-purple](./screenshots/dashboard-purple.png)
![dashboard-dark](./screenshots/dashboard-dark.png)
![sidebar](./screenshots/sidebar.jpg)
![MonthView](./screenshots/monthView.png)
![WeeklyView](./screenshots/weeklyView.png)
![GanttView](./screenshots/gantt-advanced.png)
![Timeline](./screenshots/timeline.png)
![Pomodoro](./screenshots/pomodoro.png) -->

## Shared date views

Tasks and Calendar share **1 day**, **3 days**, **5 days**, **1 week**, and **1 month** views. The default is the five-day Monday–Friday workweek; Agenda remembers your range preference. Switching modes or hiding Agenda keeps the selected date. Reloading starts on today with your saved range.

Use **Previous**, **Today**, and **Next** in either mode. Three days starts on the selected date; workweek always shows its Monday–Friday, even when today is a weekend. Full weeks and month grids follow the configured week start. Tasks month shows three compact cards per day; **+N more** opens the full, scrollable day list. Cards in that list support the same editing and dragging as the main board. Time Box remains independently navigable.

Keyboard shortcuts: **T** switches Tasks/Calendar, **W** toggles Month/Week (selecting Month from other ranges), and **[[** / **]]** navigate periods. Shortcuts are inactive while typing or using a modal. Changing views never edits task blocks.

## Planned sessions

One task can have several timed sessions. Dragging its Kanban card into Time Box or Calendar **adds a session**; dragging or resizing an existing box changes **only that session**. The task editor's **Sessions** section lets you add, change, or remove individual sessions. Removing a session does not delete the task.

Kanban shows one card on each session-start day, with a session count and that day's planned duration. Moving a card between days moves sessions starting on its source day together. Priority, Size, task completion, and notes remain shared. Each session has its own end notification; completing the task stops all its notifications.

**Estimated Time** is entered or cleared only in the task editor. Scheduling never changes it. **Actual Time** is the full duration of all time boxes (including future ones) plus manual work logs. For example, a 2h estimate, two 1h sessions, and a 15m log display **Est: 2h · Actual: 2h15m**. Manual logs are additive, even when they overlap a time box; sessions do not create duplicate `CLOCK` records. Keep recording extra work under **Actual Time → Add a log**. **Show Time Log** controls the gray manual-log boxes, not the total.

Kanban cards show task-wide Est and Actual totals. Column totals count each task's estimate only on its earliest session-start day (otherwise its scheduled or deadline day), and each session or log's full duration on its local start day, including overnight entries. Unset estimates display **—**. Changing a legacy task's estimate preserves the original box duration by saving it as a session; there is no bulk migration.

Existing timed tasks remain compatible and are not bulk migrated. Session edits store a JSON `sessions` list in the `:AGENDA:` drawer and mirror the earliest session into `SCHEDULED`; manage these tasks' schedules through Sessions. The final session can be removed without losing the task or its deadline. Same-task overlaps are rejected; overnight and adjacent sessions are supported. Recurring and multi-day all-day tasks retain their existing behavior.

## Task priorities

In Agenda 3, create or edit a task and choose **Priority** beside Size: **Blocker, Highest, High, Medium, Low, or Lowest**. Blocker ranks above Highest and has a red blocked-circle icon; the other levels use colored arrows or an equals icon. New tasks created in Agenda default to Medium; existing tasks remain unset, and the field can be cleared. Kanban and Time Box always show a priority indicator. Assigned priorities also appear in Calendar, Backlog, and Needs review.

Kanban automatically sorts each day with unfinished tasks first and completed tasks last, then by priority within each group. Unset tasks share Medium's rank, and equal-priority tasks keep their existing order. Dragging still moves tasks between dates or into Time Box, but cannot override priority order within a day. Time Box and Calendar keep scheduled-time positioning.

Priority is stored as `priority: high` in the existing `:AGENDA:` drawer. It is independent of Logseq's `[#A]`, `[#B]`, and `[#C]` markers. For recurring tasks, edit the drawer in Logseq. Priority changes preserve Size, dates, deadlines, notes, and other metadata.

## Task sizes

In Agenda 3, create or edit a task and choose **Size**: **XXL, XL, L, M, or S**. Each size has a labeled bar icon, from one filled bar for S to five for XXL. Size badges appear on task cards, calendar entries, Time Box, Backlog, and Needs review. Use the selector's clear button to remove a size; existing tasks are unset by default.

Kanban and Time Box always show the size badge. Tasks without an assigned size display **Size: —**; open the task editor to choose a size.

Sizes are saved in the task's existing `:AGENDA:` drawer as `size: XL`, alongside duration and other metadata. Recurring tasks retain their size; edit their metadata directly in Logseq, as with other recurrence edits.

## Scheduled task-end notifications

In the Logseq desktop plugin, open **Agenda 3 > Settings > General Settings** and enable **Notify when a task's scheduled time ends**. Notifications are off by default. Use **Test notification** to check desktop notification access and sound.

An unfinished timed task triggers a desktop notification at the end shown in Agenda's calendar: its scheduled start plus its estimated duration (30 minutes by default). Recurring occurrences are supported. Completed tasks, all-day tasks, objectives, and tasks without a scheduled start are excluded. View filters do not suppress alerts. Clicking a notification opens the task's block if the same graph is still active.

Logseq must remain running with the graph open; Agenda itself can stay hidden. End times are checked every 10 seconds. After a brief sleep or query failure, alerts up to five minutes late can still appear. Starting Logseq, switching graphs, or enabling notifications does not replay overdue tasks. Desktop notifications request system sound and respect the operating system's notification, sound, and Do Not Disturb settings.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=haydenull/logseq-plugin-agenda&type=Date)](https://star-history.com/#haydenull/logseq-plugin-agenda&Date)
