import { dbConnect } from "@/lib/mongodb";
import { DBEventModel, EventModel } from "@/models/eventModel.model";
import { serverErrorResponse } from "@/utils/errro";
import { withAdmin } from "@/utils/withReqeust";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return withAdmin(async (member) => {
    await dbConnect();

    const formData: DBEventModel = await req.json();

    try {
      await EventModel.create(formData);

      return NextResponse.json("성공");
    } catch (e: any) {
      return serverErrorResponse(e);
    }
  });
}

export async function PUT(req: NextRequest) {
  return withAdmin(async (member) => {
    await dbConnect();

    const formData: DBEventModel = await req.json();

    try {
      await EventModel.findOneAndUpdate(
        { eventCode: formData.eventCode },
        {
          $set: { ...formData },
        }
      );

      return NextResponse.json("성공");
    } catch (e: any) {
      return serverErrorResponse(e);
    }
  });
}
