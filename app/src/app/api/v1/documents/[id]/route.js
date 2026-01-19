import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

const toNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const strValue = typeof value === "string" ? value : String(value);
  const trimmed = strValue.trim();
  return trimmed === "" ? null : trimmed;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNullableDate = (value) => {
  if (!value) return null;
  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue;
};

export const GET = async (req, { params }) => {
  const session = await getServerSession({ req });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { id } = params;

  try {
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        documentInfo: true,
        documentSummaries: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!document)
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );

    // Organization-based access control: only allow access to documents in same organization
    const hasAccess = user.organizationId
      ? document.organizationId === user.organizationId
      : document.userId === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({ document: document });
  } catch (err) {
    console.log("Error while fetching document", err);
    return NextResponse.json(
      { error: "Document fetch failed" },
      { status: 500 }
    );
  }
};

export const PUT = async (req, context) => {
  const session = await getServerSession({ req });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const params = await context.params;
  const { id } = params;
  const body = await req.json();

  const {
    title,
    promisor,
    promisee,
    country,
    state,
    city,
    location,
    documentValue,
    duration,
    type,
    date,
    description,
    documentNumber,
    documentNumberLabel,
    registrationNo,
    registrationDate,
    landDocumentType,
    landDocumentDate,
    seller,
    purchaser,
    surveyNo,
    ctsNo,
    gutNo,
    plotNo,
    noOfPages,
    village,
    taluka,
    pincode,
    applicationNo,
    applicationDate,
    companyName,
    authorityName,
    approvalNo,
    orderNo,
    approvalDate,
    buildingName,
    projectName,
    expiryDate,
    sector,
    subject,
    drawingNo,
    drawingDate,
    buildingType,
    commenceCertificate,
    intimationOfDisapproval,
    intimationOfApproval,
    rera,
    caseType,
    caseNo,
    caseDate,
    court,
    applicant,
    petitioner,
    respondent,
    plaintiff,
    defendant,
    advocateName,
    judicature,
    coram,
  } = body;

  try {
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Organization-based access control for updates
    const hasAccess = user.organizationId
      ? existing.organizationId === user.organizationId
      : existing.userId === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        title: toNullableString(title),
        promisor: toNullableString(promisor),
        promisee: toNullableString(promisee),
        country: toNullableString(country),
        state: toNullableString(state),
        city: toNullableString(city),
        location: toNullableString(location),
        documentValue: toNullableNumber(documentValue),
        duration: toNullableNumber(duration),
        type: toNullableString(type)?.toUpperCase() || null,
        date: toNullableDate(date),
        description: toNullableString(description),
        documentNumber: toNullableString(documentNumber),
        documentNumberLabel: toNullableString(documentNumberLabel),
        registrationNo: toNullableString(registrationNo),
        registrationDate: toNullableDate(registrationDate),
        landDocumentType: toNullableString(landDocumentType),
        landDocumentDate: toNullableDate(landDocumentDate),
        seller: toNullableString(seller),
        purchaser: toNullableString(purchaser),
        surveyNo: toNullableString(surveyNo),
        ctsNo: toNullableString(ctsNo),
        gutNo: toNullableString(gutNo),
        plotNo: toNullableString(plotNo),
        noOfPages: toNullableNumber(noOfPages),
        village: toNullableString(village),
        taluka: toNullableString(taluka),
        pincode: toNullableString(pincode),
        applicationNo: toNullableString(applicationNo),
        applicationDate: toNullableDate(applicationDate),
        companyName: toNullableString(companyName),
        authorityName: toNullableString(authorityName),
        approvalNo: toNullableString(approvalNo),
        orderNo: toNullableString(orderNo),
        approvalDate: toNullableDate(approvalDate),
        buildingName: toNullableString(buildingName),
        projectName: toNullableString(projectName),
        expiryDate: toNullableDate(expiryDate),
        sector: toNullableString(sector),
        subject: toNullableString(subject),
        drawingNo: toNullableString(drawingNo),
        drawingDate: toNullableDate(drawingDate),
        buildingType: toNullableString(buildingType),
        commenceCertificate: toNullableString(commenceCertificate),
        intimationOfDisapproval: toNullableString(intimationOfDisapproval),
        intimationOfApproval: toNullableString(intimationOfApproval),
        rera: toNullableString(rera),
        caseType: toNullableString(caseType),
        caseNo: toNullableString(caseNo),
        caseDate: toNullableDate(caseDate),
        court: toNullableString(court),
        applicant: toNullableString(applicant),
        petitioner: toNullableString(petitioner),
        respondent: toNullableString(respondent),
        plaintiff: toNullableString(plaintiff),
        defendant: toNullableString(defendant),
        advocateName: toNullableString(advocateName),
        judicature: toNullableString(judicature),
        coram: toNullableString(coram),
      },
    });

    return NextResponse.json({ document: updatedDocument });
  } catch (err) {
    console.log("Error while updating document", err);
    return NextResponse.json(
      { error: "Document update failed" },
      { status: 500 }
    );
  }
};

export const DELETE = async (req, { params }) => {
  const session = await getServerSession({ req });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      {
        status: 401,
      }
    );
  }

  const { id } = params;

  const document = await prisma.document.findUnique({
    where: { id },
  });

  if (!document) {
    return NextResponse.json(
      { error: "Document not found" },
      {
        status: 404,
      }
    );
  }

  // Organization-based access control for deletion
  const hasAccess = user.organizationId
    ? document.organizationId === user.organizationId
    : document.userId === user.id;

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Access denied" },
      {
        status: 403,
      }
    );
  }

  try {
    await prisma.document.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.log("Error while deleting document", error);
    return NextResponse.json(
      { error: "Document delete failed" },
      {
        status: 500,
      }
    );
  }
};

