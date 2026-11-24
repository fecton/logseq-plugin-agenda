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

## Task priorities

In Agenda 3, create or edit a task and choose **Priority** beside Size: **Highest, High, Medium, Low, or Lowest**. Each level has a colored arrow or equals icon. New tasks created in Agenda default to Medium; existing tasks remain unset, and the field can be cleared. Kanban and Time Box always show a priority indicator. Assigned priorities also appear in Calendar, Backlog, and Needs review.

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
