import { dbConnect } from "@/lib/mongodb";
import { EventHistory } from "@/models/eventHistory.model";
import { EventModel } from "@/models/eventModel.model";
import { Member } from "@/models/member.model";
import {
  PostEventHistory,
  addEventHistory,
  isMonthOnceEventHistory,
  updateApproval,
} from "@/service/eventHistory";
import { sendSlackChat, sendSlackChatCompany } from "@/service/slack";
import { DateObject } from "@/utils/date";
import {
  BadRequestError,
  UnAuthorizedError,
  serverErrorResponse,
} from "@/utils/errro";
import { withMember } from "@/utils/withReqeust";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return withMember(async (member) => {
    const { eventCode, description, startDate, endDate }: PostEventHistory =
      await req.json();

    try {
      if (
        !eventCode ||
        !description ||
        !startDate ||
        !endDate ||
        startDate > endDate
      ) {
        throw new BadRequestError("잘못된 인자 값 입니다.");
      }

      const eventModel = await EventModel.findOne({ eventCode: eventCode });

      if (!eventModel) {
        throw new BadRequestError("잘못된 이벤트 모델 입니다.");
      }

      const result = await addEventHistory({
        eventCode,
        email: member.email,
        description,
        startDate,
        endDate,
      });

      if (
        eventModel.isMonthOnce &&
        (await isMonthOnceEventHistory(eventCode, startDate, member.email))
      ) {
        throw new BadRequestError("이번 달은 이미 사용한 이벤트 입니다.");
      }

      if (
        eventModel.isNeedApproval === false &&
        startDate >= new DateObject().toShortDate()
      ) {
        const approval = await updateApproval(result, true);

        if (approval) {
          const message = `
          [승인 완료]
          ID : ${result}
          요청자 : ${member.name}
          이벤트 : ${eventModel.name}
          사유 : ${description}
          일정 : ${startDate} - ${endDate}
          승인자 : JOB 
          `;
          await sendSlackChat(member.slackUID, message);
          //await sendSlackChatCompany(member.workType, message);
        } else {
          const message = `
          [자동 승인 실패]
          ID : ${result}
          요청자 : ${member.name}
          이벤트 : ${eventModel.name}
          사유 : ${description}
          일정 : ${startDate} - ${endDate}
          `;
          //await sendSlackChatCompany(member.workType, message);
        }
      } else {
        const managers = await Member.find({
          teamCode: member.teamCode,
          isAdmin: true,
        })
          .select("slackUID")
          .lean();
        const message = `
        [승인 요청]
        이름 : ${member.name}
        이벤트 : ${eventModel.name}
        일정 : ${startDate} - ${endDate}
        `;
        for (let manager of managers) {
          await sendSlackChat(manager.slackUID, message);
        }
      }

      return NextResponse.json({ id: result });
    } catch (e: any) {
      return serverErrorResponse(e);
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withMember(async (member) => {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    try {
      if (!id) {
        throw new BadRequestError("잘못된 인자 값 입니다.");
      }
      await dbConnect();

      const event = await EventHistory.findOne({
        _id: id,
        email: member.email,
      });

      if (!event) {
        throw new BadRequestError("잘못된 인자 값 입니다.");
      }

      if (
        event.isApproval &&
        event.startDate < new DateObject().toShortDate()
      ) {
        throw new UnAuthorizedError(
          "반영 된 과거 시점 이벤트는 삭제 할 수 없습니다."
        );
      }

      const result = await updateApproval(id, false);

      if (!result) {
        throw new Error(
          "삭제 중 문제가 발생 했습니다. 관리자에게 꼭 문의 부탁 드립니다."
        );
      }

      await EventHistory.deleteOne({ _id: id });

      return NextResponse.json("성공");
    } catch (e: any) {
      return serverErrorResponse(e);
    }
  });
}
